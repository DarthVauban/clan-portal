"use client";

import { CheckCircle2, Clock3, Hammer, History, LayoutGrid, Minus, Plus, Search, ShieldCheck, Star, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/custom-select";
import { LoadableImage } from "@/components/loadable-image";
import type { CalculatorCraftItem, CalculatorIngredient, CalculatorReferenceItem, CalculatorRecipe } from "@/components/craft-calculator";
import { usePortalAuth } from "@/lib/auth-store";
import { collectiveRoleLabels, findMembership, getPortalRole, hasAbsolutePortalRights, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { corepunkClasses } from "@/lib/corepunk-classes";
import { makePortalNotification, pushPortalNotifications } from "@/lib/notification-store";
import { useItemPreferences, type ItemCollectionFilter } from "@/lib/item-preferences";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { useResourceStore } from "@/lib/resource-store";
import {
  ALL_BANK_ID,
  deductClanCraftResources,
  getAvailableResourceAmount,
} from "@/lib/request-reservations";
import {
  makeRequestHistoryEntry,
  makeRequestId,
  useRequestStore,
  withRequestHistory,
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
  issued: "Ожидает получения",
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
const craftTypeOptions = [
  { value: "all", label: "Все" },
  { value: "weapon", label: "Оружие" },
  { value: "implant", label: "Артефакт" },
  { value: "chip", label: "Чипы" },
  { value: "rune", label: "Руны" },
  { value: "alchemy", label: "Алхимия" },
  { value: "cooking", label: "Кулинария" },
] as const;
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

const activeCraftRequestStatuses = new Set<RequestStatus>(["pending", "approved"]);
type CraftWorkspaceView = "form" | "queue";
type CraftTypeFilter = (typeof craftTypeOptions)[number]["value"];
type CraftConfirmationState = { kind: "executor" | "requester"; requestId: string };

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
  const { state: resourceState, updateState: updateResourceState } = useResourceStore();
  const { state: requestState, updateState: updateRequestState } = useRequestStore();
  const { favorites, recent, favoriteSet, recentSet, toggleFavorite, markViewed } = useItemPreferences();
  const [query, setQuery] = useState("");
  const [activeItemType, setActiveItemType] = useState<CraftTypeFilter>("all");
  const [activeClass, setActiveClass] = useState("all");
  const [activeTier, setActiveTier] = useState<number | "all">("all");
  const [activeQuality, setActiveQuality] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState<ItemCollectionFilter>("all");
  const [activeView, setActiveView] = useState<CraftWorkspaceView>("form");
  const [funding, setFunding] = useState<CraftFundingType>("personal");
  const [selectedItemSlug, setSelectedItemSlug] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<CraftConfirmationState | null>(null);

  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const portalRole = getPortalRole(collectiveState, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const effectivePortalRole = auth.isPortalAdmin ? "administrator" : portalRole;
  const canApproveClanCraft = absoluteRights || effectivePortalRole === "administrator" || effectivePortalRole === "clan-leader" || membership?.member.role === "leader" || membership?.member.role === "treasurer";
  const accessRoleLabel = portalRole !== "member"
    ? portalRoleLabels[portalRole]
    : membership ? collectiveRoleLabels[membership.member.role] : "Участник";
  const referenceBySlug = useMemo(() => new Map(referenceItems.map((item) => [item.slug, item])), [referenceItems]);
  const selectedItem = craftItems.find((item) => item.slug === selectedItemSlug) ?? null;
  const selectedRecipe = selectedItem?.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? selectedItem?.recipes[0] ?? null;
  const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const requirementsPerCraft = buildRequirements(referenceBySlug, selectedRecipe, 1, selectedItemSlug);
  const requirements = requirementsPerCraft.map((requirement) => ({ ...requirement, quantity: requirement.quantity * requestedQuantity }));
  const tierOptions = useMemo(() => [...new Set(craftItems.map((item) => item.tier))]
    .filter((tier) => Number.isFinite(tier) && tier > 0)
    .sort((first, second) => first - second), [craftItems]);
  const qualityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of craftItems) {
      for (const quality of item.qualities.length > 0 ? item.qualities : [item.quality]) values.add(quality);
    }
    return [...values]
      .map((value) => ({ value, label: qualityLabels[value] ?? value }))
      .sort((first, second) => {
        const firstOrder = qualityOrder.indexOf(first.value);
        const secondOrder = qualityOrder.indexOf(second.value);
        return (firstOrder === -1 ? 99 : firstOrder) - (secondOrder === -1 ? 99 : secondOrder);
      });
  }, [craftItems]);
  const itemMatchesType = (item: CalculatorCraftItem, filter: CraftTypeFilter) => {
    if (filter === "all") return true;
    if (filter === "alchemy" || filter === "cooking") return item.type === "consumable" && item.profession === filter;
    return item.type === filter;
  };
  const itemMatchesFilters = (
    item: CalculatorCraftItem,
    overrides: Partial<{ itemType: CraftTypeFilter; heroClass: string | "all"; tier: number | "all"; quality: string; query: string }> = {},
  ) => {
    const nextItemType = overrides.itemType ?? activeItemType;
    const nextClass = overrides.heroClass ?? activeClass;
    const nextTier = overrides.tier ?? activeTier;
    const nextQuality = overrides.quality ?? activeQuality;
    const nextQuery = overrides.query ?? query;
    const nextNormalizedQuery = nextQuery.trim().toLocaleLowerCase("ru");
    const matchesType = itemMatchesType(item, nextItemType);
    const matchesQuery = !nextNormalizedQuery || [item.name, item.englishName].some((name) => name.toLocaleLowerCase("ru").includes(nextNormalizedQuery));
    const matchesClass = nextClass === "all" || item.mastery === nextClass;
    const matchesTier = nextTier === "all" || item.tier === nextTier;
    const matchesQuality = nextQuality === "all" || item.qualities.includes(nextQuality) || item.quality === nextQuality;
    const matchesCollection = collectionFilter === "all"
      || (collectionFilter === "favorites" ? favoriteSet.has(item.slug) : recentSet.has(item.slug));
    return matchesType && matchesQuery && matchesClass && matchesTier && matchesQuality && matchesCollection;
  };
  const countCraftItems = (overrides: Parameters<typeof itemMatchesFilters>[1] = {}) => (
    craftItems.filter((item) => itemMatchesFilters(item, overrides)).length
  );
  const typeFilterCounts = Object.fromEntries(craftTypeOptions.map((option) => [option.value, countCraftItems({ itemType: option.value })]));
  const classAllCount = countCraftItems({ heroClass: "all" });
  const classCounts = Object.fromEntries(classOptions.map((heroClass) => [heroClass.value, countCraftItems({ heroClass: heroClass.value })]));
  const tierAllCount = countCraftItems({ tier: "all" });
  const tierCounts = Object.fromEntries(tierOptions.map((tier) => [tier, countCraftItems({ tier })]));
  const qualityAllCount = countCraftItems({ quality: "all" });
  const qualityCounts = Object.fromEntries(qualityOptions.map((quality) => [quality.value, countCraftItems({ quality: quality.value })]));
  const visibleItems = craftItems
    .filter((item) => itemMatchesFilters(item))
    .sort((first, second) => collectionFilter === "recent" ? recent.indexOf(first.slug) - recent.indexOf(second.slug) : 0)
    .slice(0, 80);
  const clanBalances = useMemo(() => {
    const total: Record<string, number> = {};
    const resourceSlugs = new Set(Object.values(resourceState.balances).flatMap((balance) => Object.keys(balance.resources)));
    for (const slug of resourceSlugs) {
      total[slug] = getAvailableResourceAmount(resourceState, requestState, collectiveState, ALL_BANK_ID, slug);
    }
    return total;
  }, [collectiveState, requestState, resourceState]);
  const trackedClanResources = requirementsPerCraft.filter((requirement) => requirement.type === "resource");
  const clanCoveredCraftCapacity = trackedClanResources.length > 0
    ? Math.min(...trackedClanResources.map((requirement) => Math.floor((clanBalances[requirement.slug] ?? 0) / requirement.quantity)))
    : 0;
  const coveredCrafts = Math.min(requestedQuantity, clanCoveredCraftCapacity);
  const showClanBankCoverage = funding === "clan";
  const requesterName = profile.displayName.trim() || "Игрок";
  const currentActorId = auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID;
  const currentActorIds = new Set([currentActorId, LOCAL_PLAYER_ID]);
  const currentActor: RequestActor = { id: currentActorId, name: requesterName };
  const canSubmit = Boolean(selectedItem && selectedRecipe && requestedQuantity > 0);
  const activeCraftRequests = requestState.craftRequests.filter((request) => activeCraftRequestStatuses.has(request.status) && !request.executor);
  const pendingCount = activeCraftRequests.filter((request) => request.status === "pending").length;
  const activeCount = activeCraftRequests.filter((request) => request.status === "approved" || request.status === "in-progress" || request.status === "issued").length;
  const completedCount = requestState.craftRequests.filter((request) => request.status === "completed").length;
  const confirmationRequest = confirmation
    ? requestState.craftRequests.find((request) => request.id === confirmation.requestId) ?? null
    : null;

  const chooseItem = (item: CalculatorCraftItem) => {
    setSelectedItemSlug(item.slug);
    setSelectedRecipeId(item.recipes[0]?.id ?? "");
    markViewed(item.slug);
  };

  const adjustQuantity = (delta: number) => {
    setQuantity(String(Math.max(1, requestedQuantity + delta)));
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
      clanApprover: null,
      completedBy: null,
      receiver: null,
      cancelledBy: null,
      cancelReason: "",
      history: [makeRequestHistoryEntry("pending", "Заявка создана", currentActor)],
      requesterHidden: false,
      requirements,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    updateRequestState((current) => ({ ...current, craftRequests: [request, ...current.craftRequests].slice(0, 200) }));
    setNote("");
    setQuantity("1");
    setActiveView("queue");
  };

  const updateCraftRequest = (requestId: string, updater: (request: CraftRequest) => CraftRequest) => {
    updateRequestState((current) => ({
      ...current,
      craftRequests: current.craftRequests.map((request) => request.id === requestId ? updater(request) : request),
    }));
  };

  const notifyRequester = (request: CraftRequest, kind: string, title: string, body: string, suffix = "") => {
    const notification = makePortalNotification({
      recipientPlayerId: request.requester.id,
      kind,
      title,
      body,
      href: "/requests/my-crafting",
      actor: currentActor,
      entityType: "craft-request",
      entityId: request.id,
      suffix,
    });
    if (notification) void pushPortalNotifications([notification]).catch(() => undefined);
  };

  const acceptCraftRequest = (request: CraftRequest) => {
    if (request.executor || ["completed", "rejected", "cancelled"].includes(request.status)) return;
    if (request.funding === "clan" && request.clanApprovalStatus !== "approved") return;
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "in-progress", "Заявка взята в работу", currentActor),
      executor: currentActor,
    }));
    notifyRequester(request, "craft-request-accepted", "Заявка взята в работу", `${request.itemName} x${formatAmount(request.quantity)}`, "accepted");
  };

  const updateClanApproval = (request: CraftRequest, clanApprovalStatus: ClanCraftApprovalStatus) => {
    if (request.funding !== "clan" || !canApproveClanCraft) return;
    if (clanApprovalStatus === "approved") {
      const hasFreeResources = request.requirements
        .filter((requirement) => requirement.type === "resource")
        .every((requirement) => (
          getAvailableResourceAmount(resourceState, requestState, collectiveState, ALL_BANK_ID, requirement.slug, request.id) >= requirement.quantity
        ));
      if (!hasFreeResources) return;
    }
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(
        current,
        clanApprovalStatus === "rejected" ? "rejected" : current.executor ? "in-progress" : "approved",
        clanApprovalStatus === "rejected" ? "Клановые ресурсы отклонены" : "Клановые ресурсы подтверждены",
        currentActor,
      ),
      clanApprovalStatus,
      clanApprover: clanApprovalStatus === "approved" ? currentActor : current.clanApprover,
      cancelledBy: clanApprovalStatus === "rejected" ? currentActor : current.cancelledBy,
    }));
    notifyRequester(
      request,
      clanApprovalStatus === "rejected" ? "craft-clan-resources-rejected" : "craft-clan-resources-approved",
      clanApprovalStatus === "rejected" ? "Клановые ресурсы отклонены" : "Клановые ресурсы подтверждены",
      request.itemName,
      clanApprovalStatus,
    );
  };

  const confirmCraftExecution = async (request: CraftRequest) => {
    if (!request.executor || !currentActorIds.has(request.executor.id)) return;
    if (request.status !== "in-progress") return;
    if (request.funding === "clan" && request.clanApprovalStatus !== "approved") return;
    if (request.funding === "clan") {
      const canConsumeReservation = request.requirements
        .filter((requirement) => requirement.type === "resource")
        .every((requirement) => (
          getAvailableResourceAmount(resourceState, requestState, collectiveState, ALL_BANK_ID, requirement.slug, request.id) >= requirement.quantity
        ));
      if (!canConsumeReservation) return;
      let deducted = false;
      await updateResourceState((current) => {
        const next = deductClanCraftResources(current, collectiveState, request, currentActor);
        deducted = Boolean(next);
        return next ?? current;
      });
      if (!deducted) return;
    }
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "issued", "Выполнение подтверждено", currentActor),
      completedBy: currentActor,
    }));
    notifyRequester(request, "craft-request-completed-by-executor", "Крафт выполнен", "Подтвердите получение предмета в разделе «Мои заявки».", "executor-complete");
    setConfirmation(null);
  };

  const confirmCraftReceipt = (request: CraftRequest) => {
    if (!currentActorIds.has(request.requester.id) || request.status !== "issued") return;
    updateCraftRequest(request.id, (current) => ({
      ...withRequestHistory(current, "completed", "Получение подтверждено", currentActor),
      receiver: currentActor,
    }));
    setConfirmation(null);
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

      <div className={styles.viewTabs} role="tablist" aria-label="Раздел заявок на крафт">
        <button type="button" className={activeView === "form" ? styles.viewTabActive : ""} onClick={() => setActiveView("form")}>
          Новая заявка
        </button>
        <button type="button" className={activeView === "queue" ? styles.viewTabActive : ""} onClick={() => setActiveView("queue")}>
          Очередь <small>{activeCraftRequests.length}</small>
        </button>
      </div>

      <div className={styles.requestGrid}>
        {activeView === "form" ? (
        <form className={styles.requestForm} onSubmit={createRequest}>
          <header><span>Новая заявка</span><h2>Крафт предмета</h2><p>Выберите предмет из базы, рецепт и нужное количество.</p></header>

          <div className={styles.requestComposer}>
            <section className={styles.requestPickerPanel}>
              <label className={styles.searchField}>
                <Search size={15} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск предмета..." />
              </label>

              <div className={styles.collectionTabs} role="group" aria-label="Персональная подборка предметов">
                <button type="button" className={collectionFilter === "all" ? styles.collectionTabActive : ""} onClick={() => setCollectionFilter("all")}><LayoutGrid size={14} /> Все</button>
                <button type="button" className={collectionFilter === "favorites" ? styles.collectionTabActive : ""} onClick={() => setCollectionFilter("favorites")}><Star size={14} /> Избранное <small>{favorites.length}</small></button>
                <button type="button" className={collectionFilter === "recent" ? styles.collectionTabActive : ""} onClick={() => setCollectionFilter("recent")}><History size={14} /> Недавние <small>{recent.length}</small></button>
              </div>

              <div className={styles.filterChips}>
                <div>
                  <span>Тип предмета</span>
                  {craftTypeOptions.map((option) => (
                    <button type="button" className={activeItemType === option.value ? styles.filterChipActive : ""} onClick={() => setActiveItemType(option.value)} key={option.value}>
                      {option.label} <small>{typeFilterCounts[option.value]}</small>
                    </button>
                  ))}
                </div>
                <div>
                  <span>Класс</span>
                  <button type="button" className={activeClass === "all" ? styles.filterChipActive : ""} onClick={() => setActiveClass("all")}>Все <small>{classAllCount}</small></button>
                  {classOptions.map((heroClass) => {
                    const count = classCounts[heroClass.value] ?? 0;
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
                  <button type="button" className={activeTier === "all" ? styles.filterChipActive : ""} onClick={() => setActiveTier("all")}>Все <small>{tierAllCount}</small></button>
                  {tierOptions.map((tier) => <button type="button" className={activeTier === tier ? styles.filterChipActive : ""} onClick={() => setActiveTier(tier)} key={tier}>T{tier} <small>{tierCounts[tier]}</small></button>)}
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
                    <button type="button" className={`${styles.selectedFavorite} ${favoriteSet.has(selectedItem.slug) ? styles.selectedFavoriteActive : ""}`} onClick={() => toggleFavorite(selectedItem.slug)} aria-label={favoriteSet.has(selectedItem.slug) ? "Убрать из избранного" : "Добавить в избранное"} title={favoriteSet.has(selectedItem.slug) ? "Убрать из избранного" : "Добавить в избранное"}>
                      <Star size={15} fill={favoriteSet.has(selectedItem.slug) ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <label className={styles.field}>
                    <span>Рецепт</span>
                    <CustomSelect
                      value={selectedRecipe?.id ?? ""}
                      onChange={setSelectedRecipeId}
                      ariaLabel="Рецепт"
                      options={selectedItem.recipes.map((recipe) => ({ value: recipe.id, label: recipe.name }))}
                    />
                  </label>
                </section>
              ) : (
                <div className={styles.selectedPreview}><p>Предмет не выбран</p></div>
              )}

              <div className={`${styles.compactFieldGrid} ${!showClanBankCoverage ? styles.compactFieldGridSingle : ""}`}>
                <label className={styles.field}>
                  <span>Количество</span>
                  <div className={styles.numberStepper}>
                    <button type="button" onClick={() => adjustQuantity(-1)} disabled={requestedQuantity <= 1} aria-label="Уменьшить количество">
                      <Minus size={14} />
                    </button>
                    <input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                    <button type="button" onClick={() => adjustQuantity(1)} aria-label="Увеличить количество">
                      <Plus size={14} />
                    </button>
                  </div>
                </label>
                {showClanBankCoverage && (
                  <div className={styles.coveragePreview}>
                    <strong>{formatAmount(coveredCrafts)} / {formatAmount(requestedQuantity)}</strong>
                    <small>крафтов покрывает банк</small>
                  </div>
                )}
              </div>

              {requirements.length > 0 && (
                <div className={styles.requirementPreview}>
                  {requirements.slice(0, 8).map((requirement) => {
                    const available = clanBalances[requirement.slug] ?? 0;
                    const showBankAmount = showClanBankCoverage && requirement.type === "resource";
                    return (
                      <div key={requirement.slug}>
                        <span>{requirement.image && <LoadableImage src={requirement.image} alt="" width={30} height={30} />}</span>
                        <strong>{requirement.name}</strong>
                        <em>
                          <b>{showBankAmount ? `Нужно ${formatAmount(requirement.quantity)}` : `x${formatAmount(requirement.quantity)}`}</b>
                          {showBankAmount && <small>В клане {formatAmount(available)}</small>}
                        </em>
                      </div>
                    );
                  })}
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
        ) : (
        <section className={styles.requestList}>
          <header><span>Очередь</span><h2>Заявки на крафт</h2></header>
          {activeCraftRequests.length > 0 ? activeCraftRequests.map((request) => {
            const clanResourcesAvailable = request.funding !== "clan" || request.requirements
              .filter((requirement) => requirement.type === "resource")
              .every((requirement) => (
                getAvailableResourceAmount(resourceState, requestState, collectiveState, ALL_BANK_ID, requirement.slug, request.id) >= requirement.quantity
              ));
            const canAccept = !request.executor
              && !currentActorIds.has(request.requester.id)
              && !["completed", "rejected", "cancelled"].includes(request.status)
              && (request.funding !== "clan" || (request.status === "approved" && request.clanApprovalStatus === "approved"));
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
                  <small>Создано {formatRequestDate(request.createdAt)} · материалов {request.requirements.length}{request.funding === "clan" ? clanResourcesAvailable ? " · резерв доступен" : " · не хватает свободных ресурсов" : ""}</small>
                  <div className={styles.miniRequirements}>
                    {request.requirements.slice(0, 6).map((requirement) => <span key={requirement.slug}>{requirement.name}: x{formatAmount(requirement.quantity)}</span>)}
                  </div>
                </div>
                <div className={styles.requestActions}>
                  {canAccept && <button type="button" onClick={() => acceptCraftRequest(request)}><Hammer size={14} /> Взять в работу</button>}
                  {request.funding === "clan" && request.clanApprovalStatus === "pending" && canApproveClanCraft && (
                    <>
                      <button type="button" onClick={() => updateClanApproval(request, "approved")} disabled={!clanResourcesAvailable} title={!clanResourcesAvailable ? "Часть ресурсов уже зарезервирована другими заявками" : undefined}><CheckCircle2 size={14} /> Подтвердить ресурсы</button>
                      <button type="button" className={styles.dangerButton} onClick={() => updateClanApproval(request, "rejected")}><XCircle size={14} /> Отклонить ресурсы</button>
                    </>
                  )}
                  {canCancelOwn && <button type="button" onClick={() => updateCraftRequest(request.id, (current) => ({ ...withRequestHistory(current, "cancelled", "Заявка отменена", currentActor), cancelledBy: currentActor }))}><XCircle size={14} /> Отменить</button>}
                </div>
              </article>
            );
          }) : (
            <div className={styles.emptyQueue}><Clock3 size={24} /><strong>Заявок пока нет</strong><p>Созданные заявки на крафт появятся здесь сразу после отправки.</p></div>
          )}
        </section>
        )}
      </div>

      {confirmation && confirmationRequest && (
        <div className={styles.confirmationBackdrop} role="presentation">
          <section className={styles.confirmationModal} role="dialog" aria-modal="true" aria-labelledby="craft-confirmation-title">
            <header>
              <div>
                <span>{confirmation.kind === "executor" ? "Подтверждение выполнения" : "Подтверждение получения"}</span>
                <h2 id="craft-confirmation-title">{confirmation.kind === "executor" ? "Заявка выполнена?" : "Предмет получен?"}</h2>
              </div>
              <button type="button" onClick={() => setConfirmation(null)} aria-label="Закрыть окно">
                <X size={16} />
              </button>
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
