"use client";

import { CheckCircle2, Clock3, HandCoins, Search, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import type { ResourceCatalogItem } from "@/components/resources-manager";
import { findMembership, hasAbsolutePortalRights, useCollectiveStore } from "@/lib/collective-store";
import { resourceManagerRoles, roleIsIn } from "@/lib/portal-permissions";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { emptyCollectiveBalance, makeResourceOperation, useResourceStore } from "@/lib/resource-store";
import { makeRequestId, touchRequest, useRequestStore, type RequestStatus, type ResourceRequest } from "@/lib/request-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const statusLabels: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрено",
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

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ResourceRequestsManager({ resources }: { resources: ResourceCatalogItem[] }) {
  const { profile } = useLocalProfile();
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState, updateState: updateResourceState } = useResourceStore();
  const { state: requestState, updateState: updateRequestState } = useRequestStore();
  const [query, setQuery] = useState("");
  const [activeProfession, setActiveProfession] = useState("all");
  const [activeQuality, setActiveQuality] = useState("all");
  const [selectedResourceSlug, setSelectedResourceSlug] = useState("");
  const [selectedCollectiveId, setSelectedCollectiveId] = useState("");
  const [amount, setAmount] = useState("1");
  const [purpose, setPurpose] = useState("");

  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const availableCollectives = absoluteRights ? collectiveState.collectives : membership ? [membership.collective] : [];
  const activeCollective = availableCollectives.find((collective) => collective.id === selectedCollectiveId)
    ?? availableCollectives[0]
    ?? null;
  const resourcesBySlug = useMemo(() => new Map(resources.map((resource) => [resource.slug, resource])), [resources]);
  const selectedResource = resourcesBySlug.get(selectedResourceSlug) ?? null;
  const professionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const resource of resources) counts.set(resource.profession ?? "other", (counts.get(resource.profession ?? "other") ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: professionLabels[value] ?? value }))
      .sort((first, second) => first.label.localeCompare(second.label, "ru"));
  }, [resources]);
  const qualityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const resource of resources) {
      for (const quality of resource.qualities.length > 0 ? resource.qualities : [resource.quality]) counts.set(quality, (counts.get(quality) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: qualityLabels[value] ?? value }))
      .sort((first, second) => {
        const firstOrder = qualityOrder.indexOf(first.value);
        const secondOrder = qualityOrder.indexOf(second.value);
        return (firstOrder === -1 ? 99 : firstOrder) - (secondOrder === -1 ? 99 : secondOrder);
      });
  }, [resources]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const visibleResources = resources.filter((resource) => {
    const matchesQuery = !normalizedQuery || [resource.name, resource.englishName].some((name) => name.toLocaleLowerCase("ru").includes(normalizedQuery));
    const matchesProfession = activeProfession === "all" || (resource.profession ?? "other") === activeProfession;
    const matchesQuality = activeQuality === "all" || resource.qualities.includes(activeQuality) || resource.quality === activeQuality;
    return matchesQuery && matchesProfession && matchesQuality;
  }).slice(0, 80);
  const requestedAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const requesterName = profile.displayName.trim() || "Игрок";
  const canSubmit = Boolean(activeCollective && selectedResource && requestedAmount > 0);
  const pendingCount = requestState.resourceRequests.filter((request) => request.status === "pending").length;
  const approvedCount = requestState.resourceRequests.filter((request) => request.status === "approved").length;
  const issuedCount = requestState.resourceRequests.filter((request) => request.status === "issued").length;

  const availableAmount = (collectiveId: string, resourceSlug: string) => resourceState.balances[collectiveId]?.resources[resourceSlug] ?? 0;
  const canManageRequest = (request: ResourceRequest) => {
    if (absoluteRights) return true;
    const ownMembership = findMembership(collectiveState, LOCAL_PLAYER_ID);
    return ownMembership?.collective.id === request.collectiveId && roleIsIn(ownMembership.member.role, resourceManagerRoles);
  };

  const createRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !activeCollective || !selectedResource) return;
    const now = new Date().toISOString();
    const request: ResourceRequest = {
      id: makeRequestId("resource"),
      resourceSlug: selectedResource.slug,
      resourceName: selectedResource.name,
      resourceImage: selectedResource.image,
      collectiveId: activeCollective.id,
      collectiveName: activeCollective.name,
      amount: requestedAmount,
      purpose: purpose.trim(),
      requester: { id: LOCAL_PLAYER_ID, name: requesterName },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    updateRequestState((current) => ({ ...current, resourceRequests: [request, ...current.resourceRequests].slice(0, 200) }));
    setPurpose("");
    setAmount("1");
  };

  const updateRequestStatus = (requestId: string, status: RequestStatus) => {
    updateRequestState((current) => ({
      ...current,
      resourceRequests: current.resourceRequests.map((request) => request.id === requestId ? touchRequest(request, status) : request),
    }));
  };

  const issueRequest = (request: ResourceRequest) => {
    const balance = resourceState.balances[request.collectiveId] ?? emptyCollectiveBalance();
    const currentAmount = balance.resources[request.resourceSlug] ?? 0;
    if (currentAmount < request.amount) return;
    const nextAmount = currentAmount - request.amount;
    updateResourceState((current) => ({
      balances: {
        ...current.balances,
        [request.collectiveId]: {
          ...balance,
          resources: { ...balance.resources, [request.resourceSlug]: nextAmount },
          updatedAt: new Date().toISOString(),
        },
      },
      operations: [makeResourceOperation(request.collectiveId, request.resourceSlug, -request.amount, nextAmount), ...current.operations].slice(0, 200),
    }));
    updateRequestStatus(request.id, "issued");
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

      <div className={styles.requestGrid}>
        <form className={styles.requestForm} onSubmit={createRequest}>
          <header><span>Новая заявка</span><h2>Получение ресурсов</h2><p>Выберите ресурс, количество и коллектив, из банка которого нужна выдача.</p></header>

          <label className={styles.field}>
            <span>Коллектив</span>
            <select value={activeCollective?.id ?? ""} onChange={(event) => setSelectedCollectiveId(event.target.value)}>
              {availableCollectives.map((collective) => <option value={collective.id} key={collective.id}>{collective.name}</option>)}
            </select>
          </label>

          <div className={styles.requestComposer}>
            <section className={styles.requestPickerPanel}>
              <label className={styles.searchField}>
                <Search size={15} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск ресурса..." />
              </label>

              <div className={styles.filterChips}>
                <div>
                  <span>Профессия</span>
                  <button type="button" className={activeProfession === "all" ? styles.filterChipActive : ""} onClick={() => setActiveProfession("all")}>Все</button>
                  {professionOptions.map((profession) => (
                    <button type="button" className={activeProfession === profession.value ? styles.filterChipActive : ""} onClick={() => setActiveProfession(profession.value)} key={profession.value}>
                      {profession.label} <small>{profession.count}</small>
                    </button>
                  ))}
                </div>
                <div>
                  <span>Качество</span>
                  <button type="button" className={activeQuality === "all" ? styles.filterChipActive : ""} onClick={() => setActiveQuality("all")}>Все</button>
                  {qualityOptions.map((quality) => (
                    <button type="button" className={`${activeQuality === quality.value ? styles.filterChipActive : ""} ${styles.qualityChip}`} onClick={() => setActiveQuality(quality.value)} key={quality.value}>
                      <i className={styles[quality.value]} /> {quality.label}
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
                    {activeCollective && <em>{formatAmount(availableAmount(activeCollective.id, resource.slug))}</em>}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.requestDetailsPanel}>
              <div className={styles.selectedPreview}>
                {selectedResource ? (
                  <>
                    <span>{selectedResource.image && <LoadableImage src={selectedResource.image} alt="" width={44} height={44} />}</span>
                    <div><strong>{selectedResource.name}</strong><small>Доступно: {activeCollective ? formatAmount(availableAmount(activeCollective.id, selectedResource.slug)) : "0"}</small></div>
                  </>
                ) : <p>Ресурс не выбран</p>}
              </div>

              <label className={styles.field}>
                <span>Количество</span>
                <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
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

        <section className={styles.requestList}>
          <header><span>Очередь</span><h2>Заявки на ресурсы</h2></header>
          {requestState.resourceRequests.length > 0 ? requestState.resourceRequests.map((request) => {
            const canManage = canManageRequest(request);
            const available = availableAmount(request.collectiveId, request.resourceSlug);
            const canIssue = canManage && request.status === "approved" && available >= request.amount;
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
                  <small>Создано {formatRequestDate(request.createdAt)} · доступно {formatAmount(available)}</small>
                </div>
                <div className={styles.requestActions}>
                  {canManage && request.status === "pending" && (
                    <>
                      <button type="button" onClick={() => updateRequestStatus(request.id, "approved")}><CheckCircle2 size={14} /> Одобрить</button>
                      <button type="button" className={styles.dangerButton} onClick={() => updateRequestStatus(request.id, "rejected")}><XCircle size={14} /> Отклонить</button>
                    </>
                  )}
                  {canManage && request.status === "approved" && <button type="button" onClick={() => issueRequest(request)} disabled={!canIssue}><ShieldCheck size={14} /> Выдать</button>}
                  {request.status === "pending" && request.requester.id === LOCAL_PLAYER_ID && !canManage && <button type="button" onClick={() => updateRequestStatus(request.id, "cancelled")}><XCircle size={14} /> Отменить</button>}
                </div>
              </article>
            );
          }) : (
            <div className={styles.emptyQueue}><Clock3 size={24} /><strong>Заявок пока нет</strong><p>Созданные заявки появятся здесь сразу после отправки.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
