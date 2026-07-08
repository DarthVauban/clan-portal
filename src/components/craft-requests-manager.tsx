"use client";

import { CheckCircle2, Clock3, Hammer, PackageCheck, Search, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import type { CalculatorCraftItem, CalculatorIngredient, CalculatorReferenceItem, CalculatorRecipe } from "@/components/craft-calculator";
import { usePortalAuth } from "@/lib/auth-store";
import { collectiveRoleLabels, findMembership, getPortalRole, hasAbsolutePortalRights, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { corepunkClasses } from "@/lib/corepunk-classes";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { useResourceStore } from "@/lib/resource-store";
import {
  makeRequestId,
  touchRequest,
  useRequestStore,
  type ClanCraftApprovalStatus,
  type CraftFundingType,
  type CraftRequest,
  type CraftRequestRequirement,
  type RequestActor,
  type RequestStatus,
} from "@/lib/request-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакт",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходник",
  resource: "Ресурс",
};
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
const classOptions = corepunkClasses.map((heroClass) => ({ value: heroClass.slug, label: heroClass.name }));
const craftFundingLabels: Record<CraftFundingType, string> = {
  personal: "Обычная заявка",
  clan: "За счёт ресурсов клана",
};
const clanApprovalLabels: Record<ClanCraftApprovalStatus, string> = {
  "not-required": "Подтверждение не требуется",
  pending: "Ожидает подтверждения ресурсов",
  approved: "Ресурсы клана подтверждены",
  rejected: "Ресурсы клана отклонены",
};

const activeCraftRequestStatuses = new Set<RequestStatus>(["pending", "approved", "in-progress"]);

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function fallbackName(slug: string) {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function resolveRequirement(referenceBySlug: Map<string, CalculatorReferenceItem>, ingredient: CalculatorIngredient, multiplier: number): CraftRequestRequirement & { ingredients: CalculatorIngredient[] } {
  const reference = referenceBySlug.get(ingredient.slug);
  return {
    slug: ingredient.slug,
    name: reference?.name ?? fallbackName(ingredient.slug),
    image: reference?.image ?? null,
    type: reference?.type ?? ingredient.type,
    tier: reference?.tier ?? 0,
    quantity: ingredient.quantity * multiplier,
    ingredients: reference?.ingredients ?? [],
  };
}

function buildRequirements(referenceBySlug: Map<string, CalculatorReferenceItem>, recipe: CalculatorRecipe | null, quantity: number, selectedItemSlug: string) {
  if (!recipe) return [];
  const totals = new Map<string, CraftRequestRequirement>();
  const expand = (ingredients: CalculatorIngredient[], multiplier: number, path: Set<string>) => {
    for (const ingredient of ingredients) {
      const requirement = resolveRequirement(referenceBySlug, ingredient, multiplier);
      if (requirement.ingredients.length > 0 && !path.has(requirement.slug)) {
        const nextPath = new Set(path);
        nextPath.add(requirement.slug);
        expand(requirement.ingredients, requirement.quantity, nextPath);
      } else {
        const previous = totals.get(requirement.slug);
        totals.set(requirement.slug, {
          slug: requirement.slug,
          name: requirement.name,
          image: requirement.image,
          type: requirement.type,
          tier: requirement.tier,
          quantity: (previous?.quantity ?? 0) + requirement.quantity,
        });
      }
    }
  };
  expand(recipe.ingredients, 1, new Set([selectedItemSlug]));
  return [...totals.values()]
    .map((requirement) => ({ ...requirement, quantity: requirement.quantity * quantity }))
    .sort((first, second) => first.type === second.type ? second.quantity - first.quantity : first.type === "resource" ? -1 : 1);
}

export function CraftRequestsManager({ craftItems, referenceItems }: { craftItems: CalculatorCraftItem[]; referenceItems: CalculatorReferenceItem[] }) {
  const { profile } = useLocalProfile();
  const { auth } = usePortalAuth();
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState } = useResourceStore();
  const { state: requestState, updateState: updateRequestState } = useRequestStore();
  const [query, setQuery] = useState("");
  const [activeClass, setActiveClass] = useState("all");
  const [activeTier, setActiveTier] = useState<number | "all">("all");
  const [activeQuality, setActiveQuality] = useState("all");
  const [funding, setFunding] = useState<CraftFundingType>("personal");
  const [selectedItemSlug, setSelectedItemSlug] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");

  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const portalRole = getPortalRole(collectiveState, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const effectivePortalRole = auth.isPortalAdmin ? "administrator" : portalRole;
  const canApproveClanCraft = absoluteRights || effectivePortalRole === "administrator" || effectivePortalRole === "clan-leader" || membership?.member.role === "leader";
  const accessRoleLabel = portalRole !== "member"
    ? portalRoleLabels[portalRole]
    : membership ? collectiveRoleLabels[membership.member.role] : "Участник";
  const referenceBySlug = useMemo(() => new Map(referenceItems.map((item) => [item.slug, item])), [referenceItems]);
  const selectedItem = craftItems.find((item) => item.slug === selectedItemSlug) ?? null;
  const selectedRecipe = selectedItem?.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? selectedItem?.recipes[0] ?? null;
  const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const requirements = buildRequirements(referenceBySlug, selectedRecipe, requestedQuantity, selectedItemSlug);
  const tierOptions = useMemo(() => [...new Set(craftItems.map((item) => item.tier))]
    .filter((tier) => Number.isFinite(tier) && tier > 0)
    .sort((first, second) => first - second), [craftItems]);
  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of craftItems) {
      if (item.mastery) counts.set(item.mastery, (counts.get(item.mastery) ?? 0) + 1);
    }
    return counts;
  }, [craftItems]);
  const qualityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of craftItems) {
      for (const quality of item.qualities.length > 0 ? item.qualities : [item.quality]) counts.set(quality, (counts.get(quality) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: qualityLabels[value] ?? value }))
      .sort((first, second) => {
        const firstOrder = qualityOrder.indexOf(first.value);
        const secondOrder = qualityOrder.indexOf(second.value);
        return (firstOrder === -1 ? 99 : firstOrder) - (secondOrder === -1 ? 99 : secondOrder);
      });
  }, [craftItems]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const visibleItems = craftItems.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.name, item.englishName].some((name) => name.toLocaleLowerCase("ru").includes(normalizedQuery));
    const matchesClass = activeClass === "all" || item.mastery === activeClass;
    const matchesTier = activeTier === "all" || item.tier === activeTier;
    const matchesQuality = activeQuality === "all" || item.qualities.includes(activeQuality) || item.quality === activeQuality;
    return matchesQuery && matchesClass && matchesTier && matchesQuality;
  }).slice(0, 80);
  const clanBalances = useMemo(() => {
    const total: Record<string, number> = {};
    for (const collective of collectiveState.collectives) {
      const balance = resourceState.balances[collective.id];
      if (!balance) continue;
      for (const [slug, amount] of Object.entries(balance.resources)) total[slug] = (total[slug] ?? 0) + amount;
    }
    return total;
  }, [collectiveState.collectives, resourceState.balances]);
  const coveredResources = requirements.filter((requirement) => requirement.type === "resource").reduce((total, requirement) => total + Math.min(requirement.quantity, clanBalances[requirement.slug] ?? 0), 0);
  const requiredResources = requirements.filter((requirement) => requirement.type === "resource").reduce((total, requirement) => total + requirement.quantity, 0);
  const requesterName = profile.displayName.trim() || "Игрок";
  const currentActorId = auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID;
  const currentActorIds = new Set([currentActorId, LOCAL_PLAYER_ID]);
  const currentActor: RequestActor = { id: currentActorId, name: requesterName };
  const canSubmit = Boolean(selectedItem && selectedRecipe && requestedQuantity > 0);
  const activeCraftRequests = requestState.craftRequests.filter((request) => activeCraftRequestStatuses.has(request.status));
  const pendingCount = activeCraftRequests.filter((request) => request.status === "pending").length;
  const activeCount = activeCraftRequests.filter((request) => request.status === "approved" || request.status === "in-progress").length;
  const completedCount = requestState.craftRequests.filter((request) => request.status === "completed").length;

  const chooseItem = (item: CalculatorCraftItem) => {
    setSelectedItemSlug(item.slug);
    setSelectedRecipeId(item.recipes[0]?.id ?? "");
  };

  const createRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !selectedItem || !selectedRecipe) return;
    const now = new Date().toISOString();
    const request: CraftRequest = {
      id: makeRequestId("craft"),
      itemSlug: selectedItem.slug,
      itemName: selectedItem.name,
      itemImage: selectedItem.image,
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      quantity: requestedQuantity,
      note: note.trim(),
      funding,
      clanApprovalStatus: funding === "clan" ? "pending" : "not-required",
      requester: currentActor,
      executor: null,
      requirements,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    updateRequestState((current) => ({ ...current, craftRequests: [request, ...current.craftRequests].slice(0, 200) }));
    setNote("");
    setQuantity("1");
  };

  const updateRequestStatus = (requestId: string, status: RequestStatus) => {
    updateRequestState((current) => ({
      ...current,
      craftRequests: current.craftRequests.map((request) => request.id === requestId ? touchRequest(request, status) : request),
    }));
  };

  const updateCraftRequest = (requestId: string, updater: (request: CraftRequest) => CraftRequest) => {
    updateRequestState((current) => ({
      ...current,
      craftRequests: current.craftRequests.map((request) => request.id === requestId ? updater(request) : request),
    }));
  };

  const acceptCraftRequest = (request: CraftRequest) => {
    if (request.executor || ["completed", "rejected", "cancelled"].includes(request.status)) return;
    updateCraftRequest(request.id, (current) => ({
      ...current,
      executor: currentActor,
      status: "in-progress",
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateClanApproval = (request: CraftRequest, clanApprovalStatus: ClanCraftApprovalStatus) => {
    if (request.funding !== "clan" || !canApproveClanCraft) return;
    updateCraftRequest(request.id, (current) => ({
      ...current,
      clanApprovalStatus,
      status: clanApprovalStatus === "rejected" ? "rejected" : current.executor ? "in-progress" : "approved",
      updatedAt: new Date().toISOString(),
    }));
  };

  const completeCraftRequest = (request: CraftRequest) => {
    if (!request.executor || !currentActorIds.has(request.executor.id)) return;
    if (request.funding === "clan" && request.clanApprovalStatus !== "approved") return;
    updateRequestStatus(request.id, "completed");
  };

  return (
    <div className={styles.requestWorkspace}>
      <section className={styles.summaryBar}>
        <div><small>На рассмотрении</small><strong>{pendingCount}</strong></div>
        <div><small>В работе</small><strong>{activeCount}</strong></div>
        <div><small>Завершено</small><strong>{completedCount}</strong></div>
      </section>

      <section className={styles.accessNote}>
        <ShieldCheck size={17} />
        <div><strong>{accessRoleLabel}</strong><span>{canApproveClanCraft ? "Можно подтверждать крафт за ресурсы клана" : "Можно создавать и принимать заявки на крафт"}</span></div>
      </section>

      <div className={styles.requestGrid}>
        <form className={styles.requestForm} onSubmit={createRequest}>
          <header><span>Новая заявка</span><h2>Крафт предмета</h2><p>Выберите предмет из базы, рецепт и нужное количество.</p></header>

          <div className={styles.requestComposer}>
            <section className={styles.requestPickerPanel}>
              <label className={styles.searchField}>
                <Search size={15} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск предмета..." />
              </label>

              <div className={styles.filterChips}>
                <div>
                  <span>Класс</span>
                  <button type="button" className={activeClass === "all" ? styles.filterChipActive : ""} onClick={() => setActiveClass("all")}>Все</button>
                  {classOptions.map((heroClass) => {
                    const count = classCounts.get(heroClass.value) ?? 0;
                    if (count === 0) return null;
                    return (
                      <button type="button" className={activeClass === heroClass.value ? styles.filterChipActive : ""} onClick={() => setActiveClass(heroClass.value)} key={heroClass.value}>
                        {heroClass.label} <small>{count}</small>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <span>Тир</span>
                  <button type="button" className={activeTier === "all" ? styles.filterChipActive : ""} onClick={() => setActiveTier("all")}>Все</button>
                  {tierOptions.map((tier) => <button type="button" className={activeTier === tier ? styles.filterChipActive : ""} onClick={() => setActiveTier(tier)} key={tier}>T{tier}</button>)}
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
                {visibleItems.map((item) => (
                  <button
                    type="button"
                    className={selectedItem?.slug === item.slug ? styles.pickItemActive : ""}
                    onClick={() => chooseItem(item)}
                    key={item.slug}
                  >
                    <span>{item.image ? <LoadableImage src={item.image} alt="" width={42} height={42} /> : <Hammer size={18} />}</span>
                    <div><strong>{item.name}</strong><small>{typeLabels[item.type] ?? item.type} · T{item.tier} · {item.recipes.length} рецепта</small></div>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.requestDetailsPanel}>
              <div className={styles.modeToggle}>
                <span>Тип заявки</span>
                <div>
                  <button type="button" className={funding === "personal" ? styles.modeToggleActive : ""} onClick={() => setFunding("personal")}>Обычная</button>
                  <button type="button" className={funding === "clan" ? styles.modeToggleActive : ""} onClick={() => setFunding("clan")}>За ресурсы клана</button>
                </div>
              </div>

              {selectedItem ? (
                <section className={styles.recipeBox}>
                  <div className={styles.selectedPreview}>
                    <span>{selectedItem.image ? <LoadableImage src={selectedItem.image} alt="" width={48} height={48} /> : <Hammer size={20} />}</span>
                    <div><strong>{selectedItem.name}</strong><small>{selectedItem.englishName}</small></div>
                  </div>
                  <label className={styles.field}>
                    <span>Рецепт</span>
                    <select value={selectedRecipe?.id ?? ""} onChange={(event) => setSelectedRecipeId(event.target.value)}>
                      {selectedItem.recipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
                    </select>
                  </label>
                </section>
              ) : (
                <div className={styles.selectedPreview}><p>Предмет не выбран</p></div>
              )}

              <div className={styles.compactFieldGrid}>
                <label className={styles.field}>
                  <span>Количество</span>
                  <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </label>
                <div className={styles.coveragePreview}>
                  <strong>{formatAmount(coveredResources)} / {formatAmount(requiredResources)}</strong>
                  <small>ресурсов покрыто банком</small>
                </div>
              </div>

              {requirements.length > 0 && (
                <div className={styles.requirementPreview}>
                  {requirements.slice(0, 8).map((requirement) => (
                    <div key={requirement.slug}>
                      <span>{requirement.image && <LoadableImage src={requirement.image} alt="" width={30} height={30} />}</span>
                      <strong>{requirement.name}</strong>
                      <em>x{formatAmount(requirement.quantity)}</em>
                    </div>
                  ))}
                </div>
              )}

              <label className={styles.field}>
                <span>Комментарий</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="Например: приоритет для рейда, ресурсы частично мои" />
              </label>

              <footer>
                <span>{requesterName}</span>
                <button type="submit" disabled={!canSubmit}>Отправить заявку</button>
              </footer>
            </section>
          </div>
        </form>

        <section className={styles.requestList}>
          <header><span>Очередь</span><h2>Заявки на крафт</h2></header>
          {activeCraftRequests.length > 0 ? activeCraftRequests.map((request) => {
            const canAccept = !request.executor && !currentActorIds.has(request.requester.id) && !["completed", "rejected", "cancelled"].includes(request.status);
            const canComplete = Boolean(request.executor && currentActorIds.has(request.executor.id) && request.status === "in-progress" && (request.funding !== "clan" || request.clanApprovalStatus === "approved"));
            const canCancelOwn = request.status === "pending" && currentActorIds.has(request.requester.id) && !request.executor;
            return (
              <article className={styles.requestCard} data-status={request.status} data-funding={request.funding} key={request.id}>
                <div className={styles.requestIcon}>{request.itemImage ? <LoadableImage src={request.itemImage} alt="" width={52} height={52} /> : <Hammer size={22} />}</div>
                <div className={styles.requestBody}>
                  <div className={styles.requestTitle}>
                    <strong>{request.itemName}</strong>
                    <span>{statusLabels[request.status]}</span>
                  </div>
                  <p>x{formatAmount(request.quantity)} · {request.recipeName}</p>
                  <div className={styles.requestMetaGrid}>
                    <span>Заказчик: <strong>{request.requester.name}</strong></span>
                    <span>Исполнитель: <strong>{request.executor?.name ?? "Не назначен"}</strong></span>
                  </div>
                  <div className={styles.requestBadges}>
                    <span>{craftFundingLabels[request.funding]}</span>
                    {request.funding === "clan" && <span>{clanApprovalLabels[request.clanApprovalStatus]}</span>}
                  </div>
                  {request.note && <em>{request.note}</em>}
                  <small>Создано {formatRequestDate(request.createdAt)} · материалов {request.requirements.length}</small>
                  <div className={styles.miniRequirements}>
                    {request.requirements.slice(0, 6).map((requirement) => <span key={requirement.slug}>{requirement.name}: x{formatAmount(requirement.quantity)}</span>)}
                  </div>
                </div>
                <div className={styles.requestActions}>
                  {canAccept && <button type="button" onClick={() => acceptCraftRequest(request)}><Hammer size={14} /> Взять в работу</button>}
                  {request.funding === "clan" && request.clanApprovalStatus === "pending" && canApproveClanCraft && (
                    <>
                      <button type="button" onClick={() => updateClanApproval(request, "approved")}><CheckCircle2 size={14} /> Подтвердить ресурсы</button>
                      <button type="button" className={styles.dangerButton} onClick={() => updateClanApproval(request, "rejected")}><XCircle size={14} /> Отклонить ресурсы</button>
                    </>
                  )}
                  {canComplete && <button type="button" onClick={() => completeCraftRequest(request)}><PackageCheck size={14} /> Завершить</button>}
                  {canCancelOwn && <button type="button" onClick={() => updateRequestStatus(request.id, "cancelled")}><XCircle size={14} /> Отменить</button>}
                </div>
              </article>
            );
          }) : (
            <div className={styles.emptyQueue}><Clock3 size={24} /><strong>Заявок пока нет</strong><p>Созданные заявки на крафт появятся здесь сразу после отправки.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
