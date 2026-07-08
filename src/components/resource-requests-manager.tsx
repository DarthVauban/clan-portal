"use client";

import { CheckCircle2, Clock3, HandCoins, Minus, Plus, Search, ShieldCheck, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import type { ResourceCatalogItem } from "@/components/resources-manager";
import { usePortalAuth } from "@/lib/auth-store";
import { findMembership, getPortalRole, hasAbsolutePortalRights, useCollectiveStore } from "@/lib/collective-store";
import { roleIsIn } from "@/lib/portal-permissions";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { makePortalNotification, pushPortalNotifications } from "@/lib/notification-store";
import { emptyCollectiveBalance, makeResourceOperation, useResourceStore } from "@/lib/resource-store";
import {
  makeRequestHistoryEntry,
  makeRequestId,
  useRequestStore,
  withRequestHistory,
  type RequestActor,
  type RequestStatus,
  type ResourceRequest,
} from "@/lib/request-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const statusLabels: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Ожидает получения",
  "in-progress": "В работе",
  issued: "Выдано",
  completed: "Завершено",
  rejected: "Отклонено",
  cancelled: "Отменено",
};
const qualityOrder = ["common", "uncommon", "rare", "epic"];
const qualityLabels: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};
const professionLabels: Record<string, string> = {
  alchemy: "Алхимия",
  butchery: "Разделка",
  construction: "Конструирование",
  cooking: "Кулинария",
  herbalism: "Травничество",
  logging: "Лесозаготовка",
  mining: "Горное дело",
  mysticism: "Мистицизм",
  other: "Другое",
  weaponsmithing: "Оружейное дело",
};
const resourceRequestApproverRoles = ["leader", "treasurer"] as const;
const activeResourceRequestStatuses = new Set<RequestStatus>(["pending", "approved", "issued"]);
const UNCONFIRMED_RESOURCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALL_BANK_ID = "all";
const ANCIENT_COIN_SLUG = "ancient-coin";
const ANCIENT_COIN_NAME = "Древняя монета";
const ANCIENT_COIN_IMAGE = "/game-assets/items/resource/ancient-coin.png";
type RequestAssetKind = "resource" | "currency";
type ResourceWorkspaceView = "form" | "queue";

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isExpiredUnconfirmedRequest(request: ResourceRequest) {
  return request.status === "issued" && Date.now() - new Date(request.updatedAt).getTime() > UNCONFIRMED_RESOURCE_TTL_MS;
}

export function ResourceRequestsManager({ resources }: { resources: ResourceCatalogItem[] }) {
  const { profile } = useLocalProfile();
  const { auth } = usePortalAuth();
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState, updateState: updateResourceState } = useResourceStore();
  const { state: requestState, updateState: updateRequestState } = useRequestStore();
  const [query, setQuery] = useState("");
  const [assetKind, setAssetKind] = useState<RequestAssetKind>("resource");
  const [activeView, setActiveView] = useState<ResourceWorkspaceView>("form");
  const [activeProfession, setActiveProfession] = useState("all");
  const [activeQuality, setActiveQuality] = useState("all");
  const [selectedResourceSlug, setSelectedResourceSlug] = useState("");
  const [selectedCollectiveId, setSelectedCollectiveId] = useState(ALL_BANK_ID);
  const [amount, setAmount] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const portalRole = auth.isPortalAdmin ? "administrator" : getPortalRole(collectiveState, LOCAL_PLAYER_ID);
  const clanLeadershipRights = absoluteRights || portalRole === "administrator" || portalRole === "clan-leader";
  const availableCollectives = absoluteRights || membership ? collectiveState.collectives : [];
  const activeBankId = selectedCollectiveId === ALL_BANK_ID || availableCollectives.some((collective) => collective.id === selectedCollectiveId)
    ? selectedCollectiveId
    : ALL_BANK_ID;
  const activeCollective = activeBankId === ALL_BANK_ID
    ? null
    : availableCollectives.find((collective) => collective.id === activeBankId) ?? null;
  const activeBankName = activeBankId === ALL_BANK_ID ? "Общий банк" : activeCollective?.name ?? "Общий банк";
  const requestableResources = useMemo(() => resources.filter((resource) => resource.slug !== ANCIENT_COIN_SLUG), [resources]);
  const resourcesBySlug = useMemo(() => new Map(requestableResources.map((resource) => [resource.slug, resource])), [requestableResources]);
  const selectedResource = resourcesBySlug.get(selectedResourceSlug) ?? null;
  const professionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const resource of requestableResources) values.add(resource.profession ?? "other");
    return [...values]
      .map((value) => ({ value, label: professionLabels[value] ?? value }))
      .sort((first, second) => first.label.localeCompare(second.label, "ru"));
  }, [requestableResources]);
  const qualityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const resource of requestableResources) {
      for (const quality of resource.qualities.length > 0 ? resource.qualities : [resource.quality]) values.add(quality);
    }
    return [...values]
      .map((value) => ({ value, label: qualityLabels[value] ?? value }))
      .sort((first, second) => {
        const firstOrder = qualityOrder.indexOf(first.value);
        const secondOrder = qualityOrder.indexOf(second.value);
        return (firstOrder === -1 ? 99 : firstOrder) - (secondOrder === -1 ? 99 : secondOrder);
      });
  }, [requestableResources]);
  const clanResourceTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const collective of collectiveState.collectives) {
      const balance = resourceState.balances[collective.id];
      if (!balance) continue;
      for (const [slug, value] of Object.entries(balance.resources)) totals[slug] = (totals[slug] ?? 0) + value;
    }
    return totals;
  }, [collectiveState.collectives, resourceState.balances]);
  const clanAncientCoinTotal = useMemo(() => collectiveState.collectives.reduce((total, collective) => (
    total + (resourceState.balances[collective.id]?.ancientCoin ?? 0)
  ), 0), [collectiveState.collectives, resourceState.balances]);
  const resourceAmountInBank = (resourceSlug: string, bankId = activeBankId) => {
    if (bankId === ALL_BANK_ID) return clanResourceTotals[resourceSlug] ?? 0;
    return resourceState.balances[bankId]?.resources[resourceSlug] ?? 0;
  };
  const ancientCoinAmountInBank = (bankId = activeBankId) => (
    bankId === ALL_BANK_ID ? clanAncientCoinTotal : resourceState.balances[bankId]?.ancientCoin ?? 0
  );
  const totalResourceUnitsInBank = (bankId: string) => {
    if (bankId === ALL_BANK_ID) return Object.values(clanResourceTotals).reduce((total, amount) => total + amount, 0);
    return Object.values(resourceState.balances[bankId]?.resources ?? {}).reduce((total, amount) => total + amount, 0);
  };
  const bankCounter = (bankId: string) => assetKind === "currency" ? ancientCoinAmountInBank(bankId) : totalResourceUnitsInBank(bankId);
  const resourceMatchesFilters = (
    resource: ResourceCatalogItem,
    overrides: Partial<{ profession: string; quality: string; query: string }> = {},
  ) => {
    const nextProfession = overrides.profession ?? activeProfession;
    const nextQuality = overrides.quality ?? activeQuality;
    const nextQuery = overrides.query ?? query;
    const nextNormalizedQuery = nextQuery.trim().toLocaleLowerCase("ru");
    const matchesQuery = !nextNormalizedQuery || [resource.name, resource.englishName].some((name) => name.toLocaleLowerCase("ru").includes(nextNormalizedQuery));
    const matchesProfession = nextProfession === "all" || (resource.profession ?? "other") === nextProfession;
    const matchesQuality = nextQuality === "all" || resource.qualities.includes(nextQuality) || resource.quality === nextQuality;
    return resourceAmountInBank(resource.slug) > 0 && matchesQuery && matchesProfession && matchesQuality;
  };
  const countResources = (overrides: Parameters<typeof resourceMatchesFilters>[1] = {}) => (
    requestableResources.filter((resource) => resourceMatchesFilters(resource, overrides)).length
  );
  const professionAllCount = countResources({ profession: "all" });
  const professionCounts = Object.fromEntries(professionOptions.map((profession) => [profession.value, countResources({ profession: profession.value })]));
  const qualityAllCount = countResources({ quality: "all" });
  const qualityCounts = Object.fromEntries(qualityOptions.map((quality) => [quality.value, countResources({ quality: quality.value })]));
  const visibleResources = requestableResources.filter((resource) => resourceMatchesFilters(resource)).slice(0, 80);
  const requestedAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const requesterName = profile.displayName.trim() || "Игрок";
  const requesterId = auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID;
  const currentActor: RequestActor = { id: requesterId, name: requesterName };
  const currentActorIds = new Set([requesterId, LOCAL_PLAYER_ID]);
  const selectedAvailableAmount = assetKind === "currency"
    ? ancientCoinAmountInBank()
    : selectedResource ? resourceAmountInBank(selectedResource.slug) : 0;
  const canSubmit = Boolean((activeBankId === ALL_BANK_ID || activeCollective)
    && requestedAmount > 0
    && selectedAvailableAmount > 0
    && (assetKind === "currency" || selectedResource));
  const activeResourceRequests = requestState.resourceRequests.filter((request) => activeResourceRequestStatuses.has(request.status) && !isExpiredUnconfirmedRequest(request));
  const pendingCount = activeResourceRequests.filter((request) => request.status === "pending").length;
  const approvedCount = activeResourceRequests.filter((request) => request.status === "approved").length;
  const issuedCount = requestState.resourceRequests.filter((request) => request.status === "issued").length;

  const availableAmount = (collectiveId: string, resourceSlug: string) => {
    if (resourceSlug === ANCIENT_COIN_SLUG) return ancientCoinAmountInBank(collectiveId);
    return resourceAmountInBank(resourceSlug, collectiveId);
  };
  const canManageRequest = (request: ResourceRequest) => {
    if (request.collectiveId === ALL_BANK_ID) return clanLeadershipRights;
    if (clanLeadershipRights) return true;
    const ownMembership = findMembership(collectiveState, LOCAL_PLAYER_ID);
    return ownMembership?.collective.id === request.collectiveId && roleIsIn(ownMembership.member.role, resourceRequestApproverRoles);
  };

  const notifyRequester = (request: ResourceRequest, kind: string, title: string, body: string, suffix = "") => {
    const notification = makePortalNotification({
      recipientPlayerId: request.requester.id,
      kind,
      title,
      body,
      href: "/requests/my-crafting",
      actor: currentActor,
      entityType: "resource-request",
      entityId: request.id,
      suffix,
    });
    if (notification) void pushPortalNotifications([notification]).catch(() => undefined);
  };

  const notifyResponsible = (request: ResourceRequest, kind: string, title: string, body: string, suffix = "") => {
    const recipient = request.issuer ?? request.approver;
    if (!recipient) return;
    const notification = makePortalNotification({
      recipientPlayerId: recipient.id,
      kind,
      title,
      body,
      href: "/requests/my-crafting",
      actor: currentActor,
      entityType: "resource-request",
      entityId: request.id,
      suffix,
    });
    if (notification) void pushPortalNotifications([notification]).catch(() => undefined);
  };

  const adjustAmount = (delta: number) => {
    setAmount(String(Math.max(1, requestedAmount + delta)));
  };

  const createRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || (assetKind === "resource" && !selectedResource)) return;
    const now = new Date().toISOString();
    const requestResource = assetKind === "currency"
      ? { slug: ANCIENT_COIN_SLUG, name: ANCIENT_COIN_NAME, image: ANCIENT_COIN_IMAGE }
      : { slug: selectedResource!.slug, name: selectedResource!.name, image: selectedResource!.image };
    const request: ResourceRequest = {
      id: makeRequestId("resource"),
      resourceSlug: requestResource.slug,
      resourceName: requestResource.name,
      resourceImage: requestResource.image,
      collectiveId: activeBankId,
      collectiveName: activeBankName,
      amount: requestedAmount,
      purpose: purpose.trim(),
      requester: { id: requesterId, name: requesterName },
      approver: null,
      issuer: null,
      receiver: null,
      closedBy: null,
      cancelReason: "",
      history: [makeRequestHistoryEntry("pending", "Заявка создана", currentActor)],
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    updateRequestState((current) => ({ ...current, resourceRequests: [request, ...current.resourceRequests].slice(0, 200) }));
    setPurpose("");
    setAmount("1");
    if (assetKind === "resource") setSelectedResourceSlug("");
    setActiveView("queue");
  };

  const updateResourceRequest = (requestId: string, updater: (request: ResourceRequest) => ResourceRequest) => {
    updateRequestState((current) => ({
      ...current,
      resourceRequests: current.resourceRequests.map((request) => request.id === requestId ? updater(request) : request),
    }));
  };

  const deductRequestResources = (request: ResourceRequest) => {
    if (availableAmount(request.collectiveId, request.resourceSlug) < request.amount) return;
    const now = new Date().toISOString();
    const isCurrency = request.resourceSlug === ANCIENT_COIN_SLUG;
    updateResourceState((current) => {
      if (request.collectiveId !== ALL_BANK_ID) {
        const balance = current.balances[request.collectiveId] ?? emptyCollectiveBalance();
        const currentAmount = isCurrency ? balance.ancientCoin : balance.resources[request.resourceSlug] ?? 0;
        const nextAmount = currentAmount - request.amount;
        const nextBalance = isCurrency
          ? { ...balance, ancientCoin: nextAmount, updatedAt: now }
          : { ...balance, resources: { ...balance.resources, [request.resourceSlug]: nextAmount }, updatedAt: now };
        return {
          balances: { ...current.balances, [request.collectiveId]: nextBalance },
          operations: [makeResourceOperation(request.collectiveId, request.resourceSlug, -request.amount, nextAmount, {
            actor: currentActor,
            balanceBefore: currentAmount,
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
        const currentAmount = isCurrency ? balance.ancientCoin : balance.resources[request.resourceSlug] ?? 0;
        if (currentAmount <= 0) continue;
        const taken = Math.min(currentAmount, remaining);
        const nextAmount = currentAmount - taken;
        balances[collective.id] = isCurrency
          ? { ...balance, ancientCoin: nextAmount, updatedAt: now }
          : { ...balance, resources: { ...balance.resources, [request.resourceSlug]: nextAmount }, updatedAt: now };
        operations.unshift(makeResourceOperation(collective.id, request.resourceSlug, -taken, nextAmount, {
          actor: currentActor,
          balanceBefore: currentAmount,
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
  };

  const approveRequest = (request: ResourceRequest) => {
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "approved", "Заявка одобрена", currentActor),
      approver: currentActor,
    }));
    notifyRequester(request, "resource-request-approved", "Заявка на ресурсы одобрена", `${request.resourceName}: ${formatAmount(request.amount)}`, "approved");
  };

  const rejectRequest = (request: ResourceRequest) => {
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "rejected", "Заявка отклонена", currentActor),
      closedBy: currentActor,
    }));
    notifyRequester(request, "resource-request-rejected", "Заявка на ресурсы отклонена", request.resourceName, "rejected");
  };

  const issueRequest = (request: ResourceRequest) => {
    if (availableAmount(request.collectiveId, request.resourceSlug) < request.amount) return;
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "issued", "Ресурсы выданы", currentActor),
      issuer: currentActor,
    }));
    notifyRequester(request, "resource-request-issued", "Ресурсы выданы", "Подтвердите получение в разделе «Мои заявки».", "issued");
  };

  const confirmReceipt = (request: ResourceRequest) => {
    if (availableAmount(request.collectiveId, request.resourceSlug) < request.amount) return;
    deductRequestResources(request);
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "completed", "Получение подтверждено", currentActor),
      receiver: currentActor,
      closedBy: currentActor,
    }));
    notifyResponsible(request, "resource-request-completed", "Получение ресурсов подтверждено", `${request.requester.name}: ${request.resourceName}`, "completed");
  };

  const cancelRequest = (request: ResourceRequest, reason: string) => {
    const normalizedReason = reason.trim();
    updateResourceRequest(request.id, (current) => ({
      ...withRequestHistory(current, "cancelled", "Заявка отменена", currentActor, normalizedReason),
      closedBy: currentActor,
      cancelReason: normalizedReason,
    }));
    if (!currentActorIds.has(request.requester.id)) {
      notifyRequester(request, "resource-request-cancelled", "Заявка на ресурсы отменена", normalizedReason || request.resourceName, "cancelled");
    }
  };

  const closeCancelDialog = () => {
    setCancelRequestId(null);
    setCancelReason("");
  };

  const submitCancelDialog = () => {
    const request = activeResourceRequests.find((item) => item.id === cancelRequestId);
    if (request) cancelRequest(request, cancelReason);
    closeCancelDialog();
  };

  if (availableCollectives.length === 0) {
    return (
      <section className={styles.emptyState}>
        <HandCoins size={28} />
        <h2>Нет доступного коллектива</h2>
        <p>Заявку на получение ресурсов можно подать после принятия в коллектив.</p>
      </section>
    );
  }

  return (
    <div className={styles.requestWorkspace}>
      <section className={styles.summaryBar}>
        <div><small>На рассмотрении</small><strong>{pendingCount}</strong></div>
        <div><small>Одобрено</small><strong>{approvedCount}</strong></div>
        <div><small>Выдано</small><strong>{issuedCount}</strong></div>
      </section>

      <div className={styles.viewTabs} role="tablist" aria-label="Раздел заявок на ресурсы">
        <button type="button" className={activeView === "form" ? styles.viewTabActive : ""} onClick={() => setActiveView("form")}>
          Новая заявка
        </button>
        <button type="button" className={activeView === "queue" ? styles.viewTabActive : ""} onClick={() => setActiveView("queue")}>
          Очередь <small>{activeResourceRequests.length}</small>
        </button>
      </div>

      <div className={styles.requestGrid}>
        {activeView === "form" ? (
        <form className={styles.requestForm} onSubmit={createRequest}>
          <header><span>Новая заявка</span><h2>Получение ресурсов</h2><p>Выберите ресурс, количество и коллектив, из банка которого нужна выдача.</p></header>

          <div className={styles.inlineTabs}>
            <button type="button" className={assetKind === "resource" ? styles.inlineTabActive : ""} onClick={() => setAssetKind("resource")}>Ресурсы</button>
            <button type="button" className={assetKind === "currency" ? styles.inlineTabActive : ""} onClick={() => setAssetKind("currency")}>Древняя монета</button>
          </div>

          <div className={`${styles.filterChips} ${styles.bankFilters}`}>
            <div>
              <span>Банк</span>
              <button type="button" className={activeBankId === ALL_BANK_ID ? styles.filterChipActive : ""} onClick={() => setSelectedCollectiveId(ALL_BANK_ID)}>
                Общий банк <small>{formatAmount(bankCounter(ALL_BANK_ID))}</small>
              </button>
              {availableCollectives.map((collective) => (
                <button type="button" className={activeBankId === collective.id ? styles.filterChipActive : ""} onClick={() => setSelectedCollectiveId(collective.id)} key={collective.id}>
                  {collective.name} <small>{formatAmount(bankCounter(collective.id))}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.requestComposer}>
            <section className={styles.requestPickerPanel}>
              {assetKind === "resource" ? (
                <>
              <label className={styles.searchField}>
                <Search size={15} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск ресурса..." />
              </label>

              <div className={styles.filterChips}>
                <div>
                  <span>Профессия</span>
                  <button type="button" className={activeProfession === "all" ? styles.filterChipActive : ""} onClick={() => setActiveProfession("all")}>Все <small>{professionAllCount}</small></button>
                  {professionOptions.map((profession) => (
                    <button type="button" className={activeProfession === profession.value ? styles.filterChipActive : ""} onClick={() => setActiveProfession(profession.value)} key={profession.value}>
                      {profession.label} <small>{professionCounts[profession.value]}</small>
                    </button>
                  ))}
                </div>
                <div>
                  <span>Качество</span>
                  <button type="button" className={activeQuality === "all" ? styles.filterChipActive : ""} onClick={() => setActiveQuality("all")}>Все <small>{qualityAllCount}</small></button>
                  {qualityOptions.map((quality) => (
                    <button type="button" className={`${activeQuality === quality.value ? styles.filterChipActive : ""} ${styles.qualityChip}`} onClick={() => setActiveQuality(quality.value)} key={quality.value}>
                      <i className={styles[quality.value]} /> {quality.label} <small>{qualityCounts[quality.value]}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.pickList}>
                {visibleResources.map((resource) => (
                  <button
                    type="button"
                    className={selectedResource?.slug === resource.slug ? styles.pickItemActive : ""}
                    onClick={() => setSelectedResourceSlug(resource.slug)}
                    key={resource.slug}
                  >
                    <span>{resource.image && <LoadableImage src={resource.image} alt="" width={42} height={42} />}</span>
                    <div><strong>{resource.name}</strong><small>{resource.englishName} · T{resource.tier}</small></div>
                    <em>{formatAmount(resourceAmountInBank(resource.slug))}</em>
                  </button>
                ))}
              </div>
                </>
              ) : (
                <div className={styles.currencyRequestPanel}>
                  <span><LoadableImage src={ANCIENT_COIN_IMAGE} alt="" width={62} height={62} /></span>
                  <div>
                    <small>{activeBankName}</small>
                    <strong>{ANCIENT_COIN_NAME}</strong>
                    <p>Доступно: {formatAmount(ancientCoinAmountInBank())}</p>
                  </div>
                </div>
              )}
            </section>

            <section className={styles.requestDetailsPanel}>
              <div className={styles.selectedPreview}>
                {assetKind === "currency" ? (
                  <>
                    <span><LoadableImage src={ANCIENT_COIN_IMAGE} alt="" width={44} height={44} /></span>
                    <div><strong>{ANCIENT_COIN_NAME}</strong><small>{activeBankName}: {formatAmount(selectedAvailableAmount)}</small></div>
                  </>
                ) : selectedResource ? (
                  <>
                    <span>{selectedResource.image && <LoadableImage src={selectedResource.image} alt="" width={44} height={44} />}</span>
                    <div><strong>{selectedResource.name}</strong><small>{activeBankName}: {formatAmount(selectedAvailableAmount)}</small></div>
                  </>
                ) : <p>Ресурс не выбран</p>}
              </div>

              <label className={styles.field}>
                <span>Количество</span>
                <div className={styles.numberStepper}>
                  <button type="button" onClick={() => adjustAmount(-1)} disabled={requestedAmount <= 1} aria-label="Уменьшить количество">
                    <Minus size={14} />
                  </button>
                  <input type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  <button type="button" onClick={() => adjustAmount(1)} aria-label="Увеличить количество">
                    <Plus size={14} />
                  </button>
                </div>
              </label>

              <label className={styles.field}>
                <span>Цель / комментарий</span>
                <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={240} placeholder="Например: на крафт оружия для рейда" />
              </label>

              <footer>
                <span>{requesterName}</span>
                <button type="submit" disabled={!canSubmit}>Отправить заявку</button>
              </footer>
            </section>
          </div>
        </form>
        ) : (
        <section className={styles.requestList}>
          <header><span>Очередь</span><h2>Заявки на ресурсы</h2></header>
          {activeResourceRequests.length > 0 ? activeResourceRequests.map((request) => {
            const canManage = canManageRequest(request);
            const bankAvailable = availableAmount(request.collectiveId, request.resourceSlug);
            const canIssue = canManage && request.status === "approved" && bankAvailable >= request.amount;
            const canConfirmReceipt = request.status === "issued" && currentActorIds.has(request.requester.id) && bankAvailable >= request.amount;
            const canCancel = currentActorIds.has(request.requester.id) || canManage;
            return (
              <article className={styles.requestCard} data-status={request.status} key={request.id}>
                <div className={styles.requestIcon}>{request.resourceImage && <LoadableImage src={request.resourceImage} alt="" width={52} height={52} />}</div>
                <div className={styles.requestBody}>
                  <div className={styles.requestTitle}>
                    <strong>{request.resourceName}</strong>
                    <span>{statusLabels[request.status]}</span>
                  </div>
                  <p>{formatAmount(request.amount)} ед. · {request.collectiveName} · {request.requester.name}</p>
                  {request.purpose && <em>{request.purpose}</em>}
                  <small>Создано {formatRequestDate(request.createdAt)} · доступно в банке {formatAmount(bankAvailable)}</small>
                </div>
                <div className={styles.requestActions}>
                  {canManage && request.status === "pending" && (
                    <>
                      <button type="button" onClick={() => approveRequest(request)}><CheckCircle2 size={14} /> Одобрить</button>
                      <button type="button" className={styles.dangerButton} onClick={() => rejectRequest(request)}><XCircle size={14} /> Отклонить</button>
                    </>
                  )}
                  {canManage && request.status === "approved" && <button type="button" onClick={() => issueRequest(request)} disabled={!canIssue}><ShieldCheck size={14} /> Выдать</button>}
                  {canConfirmReceipt && <button type="button" onClick={() => confirmReceipt(request)}><CheckCircle2 size={14} /> Подтвердить получение</button>}
                  {request.status !== "issued" && canCancel && <button type="button" className={styles.dangerButton} onClick={() => setCancelRequestId(request.id)}><XCircle size={14} /> Отменить</button>}
                </div>
              </article>
            );
          }) : (
            <div className={styles.emptyQueue}><Clock3 size={24} /><strong>Заявок пока нет</strong><p>Созданные заявки появятся здесь сразу после отправки.</p></div>
          )}
        </section>
        )}
      </div>

      {cancelRequestId && (
        <div className={styles.confirmationBackdrop} role="presentation">
          <section className={styles.confirmationModal} role="dialog" aria-modal="true" aria-labelledby="resource-cancel-title">
            <header>
              <div>
                <span>Подтверждение действия</span>
                <h2 id="resource-cancel-title">Отменить заявку</h2>
              </div>
              <button type="button" onClick={closeCancelDialog} aria-label="Закрыть окно"><X size={16} /></button>
            </header>
            <label className={styles.cancelReasonField}>
              <span>Причина отмены <small>(необязательно)</small></span>
              <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={240} autoFocus />
            </label>
            <footer className={styles.confirmationActions}>
              <button type="button" className={styles.confirmationSecondaryButton} onClick={closeCancelDialog}>Закрыть</button>
              <button type="button" className={styles.confirmationPrimaryButton} onClick={submitCancelDialog}>
                <CheckCircle2 size={14} /> Подтвердить
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
