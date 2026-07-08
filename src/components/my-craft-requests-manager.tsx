"use client";

import { CheckCircle2, Hammer, HandCoins, PackageCheck, RotateCcw, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import { findMembership, hasAbsolutePortalRights, useCollectiveStore } from "@/lib/collective-store";
import { makePortalNotification, pushPortalNotifications } from "@/lib/notification-store";
import { roleIsIn } from "@/lib/portal-permissions";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { emptyCollectiveBalance, makeResourceOperation, useResourceStore } from "@/lib/resource-store";
import {
  makeRequestHistoryEntry,
  makeRequestId,
  useRequestStore,
  withRequestHistory,
  type CraftRequest,
  type RequestActor,
  type RequestStatus,
  type ResourceRequest,
} from "@/lib/request-store";
import { usePortalAuth } from "@/lib/auth-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const ANCIENT_COIN_SLUG = "ancient-coin";
const ALL_BANK_ID = "all";
const managerRoles = ["leader", "treasurer"] as const;
const closedStatuses = new Set<RequestStatus>(["completed", "rejected", "cancelled"]);
const UNCONFIRMED_RESOURCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const resourceStatusLabels: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Ожидает получения",
  "in-progress": "В работе",
  issued: "Выдано",
  completed: "Завершено",
  rejected: "Отклонено",
  cancelled: "Отменено",
};
const craftStatusLabels: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрено",
  "in-progress": "Взято в работу",
  issued: "Ожидает получения",
  completed: "Завершено",
  rejected: "Отклонено",
  cancelled: "Отменено",
};
const craftFundingLabels = {
  personal: "Обычная заявка",
  clan: "За ресурсы клана",
} as const;

type MainTab = "resources" | "currency" | "craft";
type ListMode = "action" | "active" | "completed";
type CraftRole = "customer" | "executor";
type ResourceRole = "customer" | "responsible";
type CraftConfirmationState = { kind: "executor" | "requester"; requestId: string };

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isActor(actor: RequestActor | null | undefined, actorIds: Set<string>) {
  return Boolean(actor && actorIds.has(actor.id));
}

function isExpiredUnconfirmedResourceRequest(request: ResourceRequest) {
  return request.status === "issued" && Date.now() - new Date(request.updatedAt).getTime() > UNCONFIRMED_RESOURCE_TTL_MS;
}

function ProgressChain({ labels }: { labels: string[] }) {
  return (
    <div className={styles.requestBadges}>
      {labels.map((label) => <span key={label}>{label}</span>)}
    </div>
  );
}

export function MyCraftRequestsManager() {
  const { profile } = useLocalProfile();
  const { auth } = usePortalAuth();
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState, updateState: updateResourceState } = useResourceStore();
  const { state, updateState } = useRequestStore();
  const [mainTab, setMainTab] = useState<MainTab>("resources");
  const [mode, setMode] = useState<ListMode>("action");
  const [craftRole, setCraftRole] = useState<CraftRole>("customer");
  const [resourceRole, setResourceRole] = useState<ResourceRole>("customer");
  const [confirmation, setConfirmation] = useState<CraftConfirmationState | null>(null);
  const actor: RequestActor = {
    id: auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID,
    name: profile.displayName.trim() || auth.discordNickname || "Игрок",
  };
  const actorIds = useMemo(() => new Set([actor.id, LOCAL_PLAYER_ID]), [actor.id]);
  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const absoluteRights = auth.isPortalAdmin || hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const canManageAny = absoluteRights || Boolean(membership && roleIsIn(membership.member.role, managerRoles));
  const confirmationRequest = confirmation ? state.craftRequests.find((request) => request.id === confirmation.requestId) ?? null : null;

  const updateCraftRequest = (requestId: string, updater: (request: CraftRequest) => CraftRequest) => {
    updateState((current) => ({
      ...current,
      craftRequests: current.craftRequests.map((request) => request.id === requestId ? updater(request) : request),
    }));
  };

  const updateResourceRequest = (requestId: string, updater: (request: ResourceRequest) => ResourceRequest) => {
    updateState((current) => ({
      ...current,
      resourceRequests: current.resourceRequests.map((request) => request.id === requestId ? updater(request) : request),
    }));
  };

  const notify = (recipient: RequestActor | null | undefined, kind: string, title: string, body: string, entityType: string, entityId: string, suffix = "") => {
    if (!recipient) return;
    const notification = makePortalNotification({
      recipientPlayerId: recipient.id,
      kind,
      title,
      body,
      href: "/requests/my-crafting",
      actor,
      entityType,
      entityId,
      suffix,
    });
    if (notification) void pushPortalNotifications([notification]).catch(() => undefined);
  };

  const availableAmount = (collectiveId: string, resourceSlug: string) => {
    if (collectiveId === ALL_BANK_ID) {
      return collectiveState.collectives.reduce((total, collective) => {
        const balance = resourceState.balances[collective.id];
        if (!balance) return total;
        return total + (resourceSlug === ANCIENT_COIN_SLUG ? balance.ancientCoin : balance.resources[resourceSlug] ?? 0);
      }, 0);
    }
    const balance = resourceState.balances[collectiveId];
    return resourceSlug === ANCIENT_COIN_SLUG ? balance?.ancientCoin ?? 0 : balance?.resources[resourceSlug] ?? 0;
  };

  const deductResourceRequest = (request: ResourceRequest) => {
    if (availableAmount(request.collectiveId, request.resourceSlug) < request.amount) return false;
    const now = new Date().toISOString();
    const isCurrency = request.resourceSlug === ANCIENT_COIN_SLUG;
    updateResourceState((current) => {
      if (request.collectiveId !== ALL_BANK_ID) {
        const balance = current.balances[request.collectiveId] ?? emptyCollectiveBalance();
        const previousAmount = isCurrency ? balance.ancientCoin : balance.resources[request.resourceSlug] ?? 0;
        const nextAmount = Math.max(0, previousAmount - request.amount);
        return {
          balances: {
            ...current.balances,
            [request.collectiveId]: isCurrency
              ? { ...balance, ancientCoin: nextAmount, updatedAt: now }
              : { ...balance, resources: { ...balance.resources, [request.resourceSlug]: nextAmount }, updatedAt: now },
          },
          operations: [makeResourceOperation(request.collectiveId, request.resourceSlug, -request.amount, nextAmount, {
            actor,
            balanceBefore: previousAmount,
            collectiveName: request.collectiveName,
            resourceName: request.resourceName,
            resourceImage: request.resourceImage,
            note: `Заявка ${request.requester.name}`,
            source: "request",
          }), ...current.operations].slice(0, 200),
        };
      }

      let remaining = request.amount;
      const balances = { ...current.balances };
      const operations = [...current.operations];
      for (const collective of collectiveState.collectives) {
        if (remaining <= 0) break;
        const balance = balances[collective.id] ?? emptyCollectiveBalance();
        const previousAmount = isCurrency ? balance.ancientCoin : balance.resources[request.resourceSlug] ?? 0;
        if (previousAmount <= 0) continue;
        const taken = Math.min(previousAmount, remaining);
        const nextAmount = previousAmount - taken;
        balances[collective.id] = isCurrency
          ? { ...balance, ancientCoin: nextAmount, updatedAt: now }
          : { ...balance, resources: { ...balance.resources, [request.resourceSlug]: nextAmount }, updatedAt: now };
        operations.unshift(makeResourceOperation(collective.id, request.resourceSlug, -taken, nextAmount, {
          actor,
          balanceBefore: previousAmount,
          collectiveName: collective.name,
          resourceName: request.resourceName,
          resourceImage: request.resourceImage,
          note: `Заявка ${request.requester.name}`,
          source: "request",
        }));
        remaining -= taken;
      }
      return { balances, operations: operations.slice(0, 200) };
    });
    return true;
  };

  const markResourceIssued = (request: ResourceRequest) => {
    if (!canManageAny || request.status !== "approved") return;
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "issued", "Ресурсы выданы", actor),
      issuer: actor,
    }));
    notify(request.requester, "resource-request-issued", "Ресурсы выданы", "Подтвердите получение.", "resource-request", request.id, "issued");
  };

  const confirmResourceReceipt = (request: ResourceRequest) => {
    if (!actorIds.has(request.requester.id) && !canManageAny) return;
    if (!deductResourceRequest(request)) return;
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "completed", "Получение подтверждено", actor),
      receiver: actor,
      closedBy: actor,
    }));
    notify(request.issuer ?? request.approver, "resource-request-completed", "Получение подтверждено", request.resourceName, "resource-request", request.id, "completed");
  };

  const cancelResourceRequest = (request: ResourceRequest) => {
    if (!actorIds.has(request.requester.id) && !canManageAny) return;
    const reason = window.prompt("Причина отмены (необязательно)")?.trim() ?? "";
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "cancelled", "Заявка отменена", actor, reason),
      closedBy: actor,
      cancelReason: reason,
    }));
    if (!actorIds.has(request.requester.id)) {
      notify(request.requester, "resource-request-cancelled", "Заявка на ресурсы отменена", reason || request.resourceName, "resource-request", request.id, "cancelled");
    }
  };

  const confirmCraftExecution = (request: CraftRequest) => {
    if (!request.executor || !actorIds.has(request.executor.id) || request.status !== "in-progress") return;
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "issued", "Исполнитель подтвердил выполнение", actor),
      completedBy: actor,
    }));
    notify(request.requester, "craft-request-completed-by-executor", "Крафт выполнен", "Подтвердите получение предмета.", "craft-request", request.id, "executor-complete");
    setConfirmation(null);
  };

  const confirmCraftReceipt = (request: CraftRequest) => {
    if (!actorIds.has(request.requester.id) || request.status !== "issued") return;
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "completed", "Заказчик подтвердил получение", actor),
      receiver: actor,
    }));
    notify(request.executor, "craft-request-completed", "Крафт-заявка завершена", request.itemName, "craft-request", request.id, "completed");
    setConfirmation(null);
  };

  const refuseCraftRequest = (request: CraftRequest) => {
    if (!request.executor || !actorIds.has(request.executor.id) || request.status !== "in-progress") return;
    const reason = window.prompt("Комментарий к отказу (необязательно)")?.trim() ?? "";
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "cancelled", "Исполнитель отказался от заявки", actor, reason),
      cancelledBy: actor,
      cancelReason: reason,
    }));
    notify(request.requester, "craft-request-executor-cancelled", "Исполнитель отказался от заявки", reason || request.itemName, "craft-request", request.id, "executor-cancelled");
  };

  const cancelCraftRequest = (request: CraftRequest) => {
    if (!actorIds.has(request.requester.id) || request.status === "completed" || request.status === "issued") return;
    const reason = window.prompt("Причина отмены (необязательно)")?.trim() ?? "";
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "cancelled", "Заявка отменена заказчиком", actor, reason),
      cancelledBy: actor,
      cancelReason: reason,
    }));
    notify(request.executor, "craft-request-cancelled-by-requester", "Заказчик отменил заявку", reason || request.itemName, "craft-request", request.id, "requester-cancelled");
  };

  const repostCraftRequest = (request: CraftRequest) => {
    const now = new Date().toISOString();
    const next: CraftRequest = {
      ...request,
      id: makeRequestId("craft"),
      executor: null,
      clanApprover: null,
      completedBy: null,
      receiver: null,
      cancelledBy: null,
      cancelReason: "",
      requesterHidden: false,
      clanApprovalStatus: request.funding === "clan" ? "pending" : "not-required",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      history: [makeRequestHistoryEntry("pending", "Заявка размещена повторно", actor)],
    };
    updateState((current) => ({ ...current, craftRequests: [next, ...current.craftRequests].slice(0, 300) }));
  };

  const hideCraftRequest = (request: CraftRequest) => {
    updateCraftRequest(request.id, (current) => ({ ...current, requesterHidden: true, updatedAt: new Date().toISOString() }));
  };

  const resourceRequests = state.resourceRequests.filter((request) => {
    const isCurrency = request.resourceSlug === ANCIENT_COIN_SLUG;
    if (mainTab === "resources" && isCurrency) return false;
    if (mainTab === "currency" && !isCurrency) return false;
    const owns = actorIds.has(request.requester.id);
    const responsible = isActor(request.approver, actorIds) || isActor(request.issuer, actorIds) || (canManageAny && ["approved", "issued"].includes(request.status));
    if (resourceRole === "customer" && !owns) return false;
    if (resourceRole === "responsible" && !responsible) return false;
    if (mode === "completed") return closedStatuses.has(request.status);
    if (isExpiredUnconfirmedResourceRequest(request)) return false;
    if (mode === "action") {
      return (owns && request.status === "issued") || (responsible && request.status === "approved");
    }
    return !closedStatuses.has(request.status);
  });

  const craftCustomerRequests = state.craftRequests.filter((request) => actorIds.has(request.requester.id) && !request.requesterHidden);
  const craftExecutorRequests = state.craftRequests.filter((request) => isActor(request.executor, actorIds));
  const craftRequests = (craftRole === "customer" ? craftCustomerRequests : craftExecutorRequests).filter((request) => {
    if (mode === "completed") return closedStatuses.has(request.status);
    if (mode === "action") {
      return (craftRole === "customer" && request.status === "issued")
        || (craftRole === "executor" && request.status === "in-progress");
    }
    return !closedStatuses.has(request.status);
  });

  const actionCount = state.resourceRequests.filter((request) => (
    !isExpiredUnconfirmedResourceRequest(request)
    && (
    (actorIds.has(request.requester.id) && request.status === "issued")
    || ((isActor(request.approver, actorIds) || isActor(request.issuer, actorIds) || canManageAny) && request.status === "approved")
    )
  )).length + state.craftRequests.filter((request) => (
    !request.requesterHidden
    && ((actorIds.has(request.requester.id) && request.status === "issued") || (isActor(request.executor, actorIds) && request.status === "in-progress"))
  )).length;

  const visibleRequests = mainTab === "craft" ? craftRequests : resourceRequests;

  return (
    <div className={styles.requestWorkspace}>
      <section className={styles.summaryBar}>
        <div><small>Требуют действия</small><strong>{actionCount}</strong></div>
        <div><small>Ресурсы и валюта</small><strong>{state.resourceRequests.filter((request) => actorIds.has(request.requester.id)).length}</strong></div>
        <div><small>Крафт</small><strong>{craftCustomerRequests.length + craftExecutorRequests.length}</strong></div>
      </section>

      <section className={styles.requestList}>
        <header>
          <span>Личный список</span>
          <h2>Мои заявки</h2>
          <div className={styles.inlineTabs}>
            <button type="button" className={mainTab === "resources" ? styles.inlineTabActive : ""} onClick={() => setMainTab("resources")}>Ресурсы</button>
            <button type="button" className={mainTab === "currency" ? styles.inlineTabActive : ""} onClick={() => setMainTab("currency")}>Валюта</button>
            <button type="button" className={mainTab === "craft" ? styles.inlineTabActive : ""} onClick={() => setMainTab("craft")}>Крафт</button>
          </div>
          <div className={styles.inlineTabs}>
            <button type="button" className={mode === "action" ? styles.inlineTabActive : ""} onClick={() => setMode("action")}>Требуют моего действия <small>{actionCount}</small></button>
            <button type="button" className={mode === "active" ? styles.inlineTabActive : ""} onClick={() => setMode("active")}>Активные</button>
            <button type="button" className={mode === "completed" ? styles.inlineTabActive : ""} onClick={() => setMode("completed")}>Завершенные</button>
          </div>
          {mainTab === "craft" ? (
            <div className={styles.inlineTabs}>
              <button type="button" className={craftRole === "customer" ? styles.inlineTabActive : ""} onClick={() => setCraftRole("customer")}>Как заказчик</button>
              <button type="button" className={craftRole === "executor" ? styles.inlineTabActive : ""} onClick={() => setCraftRole("executor")}>Как исполнитель</button>
            </div>
          ) : (
            <div className={styles.inlineTabs}>
              <button type="button" className={resourceRole === "customer" ? styles.inlineTabActive : ""} onClick={() => setResourceRole("customer")}>Как заказчик</button>
              <button type="button" className={resourceRole === "responsible" ? styles.inlineTabActive : ""} onClick={() => setResourceRole("responsible")}>Как ответственный</button>
            </div>
          )}
        </header>

        {visibleRequests.length > 0 ? visibleRequests.map((request) => (
          mainTab === "craft"
            ? (
              <CraftRequestCard
                key={request.id}
                request={request as CraftRequest}
                role={craftRole}
                onConfirmExecution={() => setConfirmation({ kind: "executor", requestId: request.id })}
                onConfirmReceipt={() => setConfirmation({ kind: "requester", requestId: request.id })}
                onRefuse={() => refuseCraftRequest(request as CraftRequest)}
                onCancel={() => cancelCraftRequest(request as CraftRequest)}
                onRepost={() => repostCraftRequest(request as CraftRequest)}
                onHide={() => hideCraftRequest(request as CraftRequest)}
              />
            )
            : (
              <ResourceRequestCard
                key={request.id}
                request={request as ResourceRequest}
                actorIds={actorIds}
                canManageAny={canManageAny}
                onIssue={() => markResourceIssued(request as ResourceRequest)}
                onConfirmReceipt={() => confirmResourceReceipt(request as ResourceRequest)}
                onCancel={() => cancelResourceRequest(request as ResourceRequest)}
              />
            )
        )) : (
          <div className={styles.emptyQueue}>
            {mainTab === "craft" ? <PackageCheck size={24} /> : <HandCoins size={24} />}
            <strong>Заявок пока нет</strong>
            <p>Заявки появятся здесь после создания, принятия в работу или смены статуса.</p>
          </div>
        )}
      </section>

      {confirmation && confirmationRequest && (
        <div className={styles.confirmationBackdrop} role="presentation">
          <section className={styles.confirmationModal} role="dialog" aria-modal="true" aria-labelledby="my-craft-confirmation-title">
            <header>
              <div>
                <span>{confirmation.kind === "executor" ? "Подтверждение выполнения" : "Подтверждение получения"}</span>
                <h2 id="my-craft-confirmation-title">{confirmation.kind === "executor" ? "Заявка выполнена?" : "Предмет получен?"}</h2>
              </div>
              <button type="button" onClick={() => setConfirmation(null)} aria-label="Закрыть окно"><X size={16} /></button>
            </header>

            <div className={styles.confirmationItem}>
              <span>{confirmationRequest.itemImage ? <LoadableImage src={confirmationRequest.itemImage} alt="" width={58} height={58} /> : <Hammer size={24} />}</span>
              <div>
                <strong>{confirmationRequest.itemName}</strong>
                <small>x{formatAmount(confirmationRequest.quantity)} · {confirmationRequest.recipeName}</small>
              </div>
            </div>

            <dl className={styles.confirmationDetails}>
              <div><dt>Заказчик</dt><dd>{confirmationRequest.requester.name}</dd></div>
              <div><dt>Исполнитель</dt><dd>{confirmationRequest.executor?.name ?? "Не назначен"}</dd></div>
              <div><dt>Тип заявки</dt><dd>{craftFundingLabels[confirmationRequest.funding]}</dd></div>
            </dl>

            <div className={styles.confirmationNote}>
              <span>Комментарий заказчика</span>
              <p>{confirmationRequest.note || "Комментарий не указан."}</p>
            </div>

            <footer className={styles.confirmationActions}>
              <button type="button" className={styles.confirmationSecondaryButton} onClick={() => setConfirmation(null)}>Закрыть</button>
              <button type="button" className={styles.confirmationCancelButton} onClick={() => setConfirmation(null)}>Отмена</button>
              <button
                type="button"
                className={styles.confirmationPrimaryButton}
                onClick={() => confirmation.kind === "executor" ? confirmCraftExecution(confirmationRequest) : confirmCraftReceipt(confirmationRequest)}
              >
                <CheckCircle2 size={14} /> Подтвердить
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function ResourceRequestCard({
  request,
  actorIds,
  canManageAny,
  onIssue,
  onConfirmReceipt,
  onCancel,
}: {
  request: ResourceRequest;
  actorIds: Set<string>;
  canManageAny: boolean;
  onIssue: () => void;
  onConfirmReceipt: () => void;
  onCancel: () => void;
}) {
  const canIssue = request.status === "approved" && (canManageAny || isActor(request.approver, actorIds));
  const canConfirmReceipt = request.status === "issued" && (actorIds.has(request.requester.id) || canManageAny);
  const canCancel = !closedStatuses.has(request.status) && request.status !== "issued" && (actorIds.has(request.requester.id) || canManageAny);
  return (
    <article className={styles.requestCard} data-status={request.status}>
      <div className={styles.requestIcon}>{request.resourceImage && <LoadableImage src={request.resourceImage} alt="" width={52} height={52} />}</div>
      <div className={styles.requestBody}>
        <div className={styles.requestTitle}>
          <strong>{request.resourceName}</strong>
          <span>{resourceStatusLabels[request.status]}</span>
        </div>
        <p>{formatAmount(request.amount)} ед. · {request.collectiveName} · {request.requester.name}</p>
        {request.purpose && <em>{request.purpose}</em>}
        <ProgressChain labels={["Создано", request.approver ? "Одобрено" : "Ожидает", request.issuer ? "Выдано" : "Выдача", request.receiver ? "Получено" : "Получение"]} />
        <small>Создано {formatRequestDate(request.createdAt)}{request.issuer ? ` · Выдающий: ${request.issuer.name}` : ""}</small>
        {request.history.length > 0 && (
          <div className={styles.miniRequirements}>
            {request.history.slice(0, 4).map((entry) => <span key={entry.id}>{entry.label}: {entry.actor?.name ?? "Система"}</span>)}
          </div>
        )}
      </div>
      <div className={styles.requestActions}>
        {canIssue && <button type="button" onClick={onIssue}><PackageCheck size={14} /> Подтвердить выдачу</button>}
        {canConfirmReceipt && <button type="button" onClick={onConfirmReceipt}><CheckCircle2 size={14} /> Подтвердить получение</button>}
        {canCancel && <button type="button" className={styles.dangerButton} onClick={onCancel}><XCircle size={14} /> Отменить</button>}
      </div>
    </article>
  );
}

function CraftRequestCard({
  request,
  role,
  onConfirmExecution,
  onConfirmReceipt,
  onRefuse,
  onCancel,
  onRepost,
  onHide,
}: {
  request: CraftRequest;
  role: CraftRole;
  onConfirmExecution: () => void;
  onConfirmReceipt: () => void;
  onRefuse: () => void;
  onCancel: () => void;
  onRepost: () => void;
  onHide: () => void;
}) {
  return (
    <article className={styles.requestCard} data-status={request.status} data-funding={request.funding}>
      <div className={styles.requestIcon}>{request.itemImage ? <LoadableImage src={request.itemImage} alt="" width={52} height={52} /> : <Hammer size={22} />}</div>
      <div className={styles.requestBody}>
        <div className={styles.requestTitle}>
          <strong>{request.itemName}</strong>
          <span>{craftStatusLabels[request.status]}</span>
        </div>
        <p>x{formatAmount(request.quantity)} · {request.recipeName}</p>
        <div className={styles.requestMetaGrid}>
          <span>Заказчик: <strong>{request.requester.name}</strong></span>
          <span>Исполнитель: <strong>{request.executor?.name ?? "Не назначен"}</strong></span>
        </div>
        <ProgressChain labels={["Создано", request.executor ? "В работе" : "Ожидает", request.completedBy ? "Выполнено" : "Выполнение", request.receiver ? "Получено" : "Получение"]} />
        <div className={styles.requestBadges}>
          <span>{craftFundingLabels[request.funding]}</span>
          {request.cancelReason && <span>{request.cancelReason}</span>}
        </div>
        {request.note && <em>{request.note}</em>}
        <small>Создано {formatRequestDate(request.createdAt)} · материалов {request.requirements.length}</small>
        {request.history.length > 0 && (
          <div className={styles.miniRequirements}>
            {request.history.slice(0, 4).map((entry) => <span key={entry.id}>{entry.label}: {entry.actor?.name ?? "Система"}</span>)}
          </div>
        )}
      </div>
      <div className={styles.requestActions}>
        {role === "executor" && request.status === "in-progress" && (
          <>
            <button type="button" onClick={onConfirmExecution}><PackageCheck size={14} /> Подтвердить выполнение</button>
            <button type="button" className={styles.dangerButton} onClick={onRefuse}><XCircle size={14} /> Отказаться</button>
          </>
        )}
        {role === "customer" && request.status === "issued" && <button type="button" onClick={onConfirmReceipt}><CheckCircle2 size={14} /> Подтвердить получение</button>}
        {role === "customer" && request.status === "in-progress" && <button type="button" className={styles.dangerButton} onClick={onCancel}><XCircle size={14} /> Отменить</button>}
        {role === "customer" && request.status === "cancelled" && (
          <>
            <button type="button" onClick={onRepost}><RotateCcw size={14} /> Разместить повторно</button>
            <button type="button" className={styles.dangerButton} onClick={onHide}><XCircle size={14} /> Удалить</button>
          </>
        )}
      </div>
    </article>
  );
}
