"use client";

import { LoadableImage } from "@/components/loadable-image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Cpu,
  FlaskConical,
  Gem,
  Hexagon,
  History,
  LayoutGrid,
  RotateCcw,
  Star,
  Swords,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KnowledgeSearch } from "@/components/knowledge-search";
import { ItemNameLanguageToggle } from "@/components/item-name-language-toggle";
import { type CorepunkCatalogDataset } from "@/lib/corepunk-item-data";
import { useItemPreferences, type ItemCollectionFilter } from "@/lib/item-preferences";
import { useItemNameLanguage } from "@/lib/use-item-name-language";
import styles from "@/app/items/item-card.module.css";

const categories = [
  { id: "weapons", type: "weapon", label: "Оружие", description: "Клинки, огнестрельное и магическое оружие", icon: Swords },
  { id: "artifacts", type: "implant", label: "Артефакты", description: "Импланты и экипируемые артефакты", icon: Gem },
  { id: "chips", type: "chip", label: "Чипы", description: "Боевые и вспомогательные чипы", icon: Cpu },
  { id: "runes", type: "rune", label: "Руны", description: "Руны усиления и модификации", icon: Hexagon },
  { id: "consumables", type: "consumable", label: "Расходные материалы", description: "Еда, зелья, рецепты и расходники", icon: FlaskConical },
  { id: "resources", type: "resource", label: "Ресурсы", description: "Сырьё и материалы для крафта", icon: Boxes },
] as const;

const tiers = [1, 2, 3] as const;
const qualities = ["common", "uncommon", "rare", "epic"] as const;
const weaponClasses = [
  { value: "legionnary", label: "Легионер" },
  { value: "shaman", label: "Шаман" },
  { value: "ranger", label: "Рейнджер" },
  { value: "destroyer", label: "Разрушитель" },
  { value: "defender", label: "Защитник" },
  { value: "blast-medic", label: "Взрывной медик" },
  { value: "infiltrator", label: "Инфильтратор" },
] as const;
const consumableProfessions = [
  { value: "cooking", label: "Кулинария" },
  { value: "alchemy", label: "Алхимия" },
  { value: "mysticism", label: "Мистицизм" },
] as const;
const resourceProfessions = [
  { value: "mining", label: "Горное дело" },
  { value: "herbalism", label: "Травничество" },
  { value: "logging", label: "Лесозаготовка" },
  { value: "butchery", label: "Разделка" },
  { value: "other", label: "Другое" },
] as const;
const primaryResourceProfessions: ReadonlySet<string> = new Set(resourceProfessions.filter(({ value }) => value !== "other").map(({ value }) => value));
const weaponClassLabels = Object.fromEntries(weaponClasses.map((weaponClass) => [weaponClass.value, weaponClass.label]));
const qualityLabels: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};
const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакт",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходный материал",
  resource: "Ресурс",
};
const PAGE_SIZE = 60;
const CATALOG_RESTORE_KEY = "clan-portal:item-catalog-restore";
const weaponStatsIgnoredInFilters: ReadonlySet<string> = new Set(["wd", "as"]);

type CategoryId = (typeof categories)[number]["id"];
type CatalogState = {
  category: CategoryId;
  tier: number | "all";
  quality: string | "all";
  weaponClass: string | "all";
  profession: string | "all";
  statFilters: string[];
  query: string;
};

const categoryIds = new Set<CategoryId>(categories.map(({ id }) => id));
const validQualities = new Set<string>(qualities);
const validWeaponClasses = new Set<string>(weaponClasses.map(({ value }) => value));
const validProfessions = new Set<string>([
  ...consumableProfessions.map(({ value }) => value),
  ...resourceProfessions.map(({ value }) => value),
]);

function readCatalogState(searchParams: URLSearchParams | Readonly<URLSearchParams>): CatalogState {
  const categoryValue = searchParams.get("category") as CategoryId | null;
  const category = categoryValue && categoryIds.has(categoryValue) ? categoryValue : "weapons";
  const tierValue = Number(searchParams.get("tier"));
  const qualityValue = searchParams.get("quality");
  const classValue = searchParams.get("class");
  const professionValue = searchParams.get("profession");
  const statFilters = [...new Set((searchParams.get("stats") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-z0-9-]+$/i.test(value)))];
  const professionOptions = category === "consumables"
    ? new Set<string>(consumableProfessions.map(({ value }) => value))
    : category === "resources"
      ? new Set<string>(resourceProfessions.map(({ value }) => value))
      : new Set<string>();
  return {
    category,
    tier: tiers.includes(tierValue as (typeof tiers)[number]) ? tierValue : "all",
    quality: qualityValue && validQualities.has(qualityValue) ? qualityValue : "all",
    weaponClass: classValue && validWeaponClasses.has(classValue) ? classValue : "all",
    profession: professionValue && validProfessions.has(professionValue) && professionOptions.has(professionValue) ? professionValue : "all",
    statFilters: ["weapons", "artifacts"].includes(category) ? statFilters : [],
    query: searchParams.get("q") ?? "",
  };
}

function writeCatalogState(currentParams: string, state: CatalogState) {
  const params = new URLSearchParams(currentParams);
  const values: Array<[string, string | null]> = [
    ["category", state.category === "weapons" ? null : state.category],
    ["tier", state.tier === "all" ? null : String(state.tier)],
    ["quality", state.quality === "all" ? null : state.quality],
    ["class", state.category === "weapons" && state.weaponClass !== "all" ? state.weaponClass : null],
    ["profession", ["consumables", "resources"].includes(state.category) && state.profession !== "all" ? state.profession : null],
    ["stats", ["weapons", "artifacts"].includes(state.category) && state.statFilters.length > 0 ? state.statFilters.join(",") : null],
    ["q", state.query.trim() || null],
  ];
  for (const [key, value] of values) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

function pluralItems(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} предметов`;
  if (last === 1) return `${count} предмет`;
  if (last >= 2 && last <= 4) return `${count} предмета`;
  return `${count} предметов`;
}

function saveCatalogRestore(href: string, scrollY: number, visibleLimit: number) {
  sessionStorage.setItem(CATALOG_RESTORE_KEY, JSON.stringify({
    href,
    scrollY,
    visibleLimit,
    at: Date.now(),
  }));
}

function makeStatFilterOptions(
  items: CorepunkCatalogDataset["items"],
  itemType: string,
  stats: CorepunkCatalogDataset["stats"],
  ignoredTypes: ReadonlySet<string> = new Set<string>(),
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.type !== itemType) continue;
    const uniqueTypes = new Set(item.stats.map((stat) => stat.type).filter((type) => !ignoredTypes.has(type)));
    for (const type of uniqueTypes) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, asset: stats[type], label: stats[type]?.label ?? type.toUpperCase() }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));
}

export function KnowledgeCatalog({ dataset }: { dataset: CorepunkCatalogDataset }) {
  const { showEnglishNames, setShowEnglishNames } = useItemNameLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const [catalogState, setCatalogState] = useState<CatalogState>(() => readCatalogState(searchParams));
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [collectionFilter, setCollectionFilter] = useState<ItemCollectionFilter>("all");
  const { favorites, recent, favoriteSet, recentSet, toggleFavorite, markViewed } = useItemPreferences();
  const {
    category: activeCategory,
    tier: activeTier,
    quality: activeQuality,
    weaponClass: activeWeaponClass,
    profession: activeProfession,
    statFilters: requestedStatFilters,
    query,
  } = catalogState;

  const updateCatalogState = (updates: Partial<CatalogState>) => {
    const categoryChanged = updates.category !== undefined && updates.category !== catalogState.category;
    const nextState = {
      ...catalogState,
      ...updates,
      ...(categoryChanged ? { weaponClass: "all" as const, profession: "all" as const, statFilters: [] } : {}),
    };
    if (!["weapons", "artifacts"].includes(nextState.category)) nextState.statFilters = [];
    if (nextState.category !== "weapons") nextState.weaponClass = "all";
    if (!["consumables", "resources"].includes(nextState.category)) nextState.profession = "all";
    setCatalogState(nextState);
    setVisibleLimit(PAGE_SIZE);
    const nextSearchParams = writeCatalogState(serializedSearchParams, nextState);
    router.replace(`${pathname}${nextSearchParams ? `?${nextSearchParams}` : ""}`, { scroll: false });
  };

  const activeCategoryData = categories.find((category) => category.id === activeCategory)!;
  const ActiveIcon = activeCategoryData.icon;
  const categoryCounts = useMemo(() => Object.fromEntries(
    categories.map((category) => [category.id, dataset.items.filter((item) => (
      item.type === category.type
      && (collectionFilter === "all"
        || (collectionFilter === "favorites" ? favorites.includes(item.slug) : recent.includes(item.slug)))
    )).length]),
  ), [collectionFilter, dataset.items, favorites, recent]);
  const weaponStatOptions = useMemo(() => makeStatFilterOptions(dataset.items, "weapon", dataset.stats, weaponStatsIgnoredInFilters), [dataset.items, dataset.stats]);
  const artifactStatOptions = useMemo(() => makeStatFilterOptions(dataset.items, "implant", dataset.stats), [dataset.items, dataset.stats]);
  const activeStatOptions = useMemo(() => (
    activeCategory === "weapons" ? weaponStatOptions : activeCategory === "artifacts" ? artifactStatOptions : []
  ), [activeCategory, artifactStatOptions, weaponStatOptions]);
  const availableStatTypes = useMemo(() => new Set(activeStatOptions.map((option) => option.type)), [activeStatOptions]);
  const activeStatFilters = requestedStatFilters
    .filter((type) => availableStatTypes.has(type))
    .slice(0, activeCategory === "weapons" ? 1 : undefined);
  const activeStatSet = useMemo(() => new Set(activeStatFilters), [activeStatFilters]);
  const itemMatchesCurrentFilters = (
    item: CorepunkCatalogDataset["items"][number],
    overrides: Partial<Pick<CatalogState, "tier" | "quality" | "weaponClass" | "profession" | "statFilters" | "query">> = {},
  ) => {
    const nextTier = overrides.tier ?? activeTier;
    const nextQuality = overrides.quality ?? activeQuality;
    const nextWeaponClass = overrides.weaponClass ?? activeWeaponClass;
    const nextProfession = overrides.profession ?? activeProfession;
    const nextStatFilters = overrides.statFilters ?? activeStatFilters;
    const nextQuery = overrides.query ?? query;
    const nextNormalizedQuery = nextQuery.trim().toLocaleLowerCase("ru");
    const matchesCategory = item.type === activeCategoryData.type;
    const matchesTier = nextTier === "all" || item.tier === nextTier;
    const matchesQuality = nextQuality === "all" || item.variations.some((variation) => variation.quality === nextQuality);
    const matchesWeaponClass = activeCategoryData.type !== "weapon" || nextWeaponClass === "all" || item.mastery === nextWeaponClass;
    const matchesProfession = nextProfession === "all"
      || (activeCategoryData.type === "consumable" && item.profession === nextProfession)
      || (activeCategoryData.type === "resource" && (
        nextProfession === "other"
          ? !primaryResourceProfessions.has(item.profession ?? "")
          : item.profession === nextProfession
      ))
      || !["consumable", "resource"].includes(activeCategoryData.type);
    const matchesStats = nextStatFilters.length === 0 || nextStatFilters.every((statType) => item.stats.some((stat) => stat.type === statType));
    const matchesQuery = !nextNormalizedQuery || [item.name, item.englishName].some((name) => name.toLocaleLowerCase("ru").includes(nextNormalizedQuery));
    return matchesCategory && matchesTier && matchesQuality && matchesWeaponClass && matchesProfession && matchesStats && matchesQuery;
  };
  const countItemsForFilters = (overrides: Parameters<typeof itemMatchesCurrentFilters>[1] = {}) => (
    dataset.items.filter((item) => (
      itemMatchesCurrentFilters(item, overrides)
      && (collectionFilter === "all" || (collectionFilter === "favorites" ? favoriteSet.has(item.slug) : recentSet.has(item.slug)))
    )).length
  );
  const weaponClassAllCount = countItemsForFilters({ weaponClass: "all" });
  const consumableProfessionAllCount = countItemsForFilters({ profession: "all" });
  const resourceProfessionAllCount = countItemsForFilters({ profession: "all" });
  const weaponClassFilterCounts = Object.fromEntries(
    weaponClasses.map((weaponClass) => [weaponClass.value, countItemsForFilters({ weaponClass: weaponClass.value })]),
  );
  const consumableProfessionFilterCounts = Object.fromEntries(
    consumableProfessions.map((profession) => [profession.value, countItemsForFilters({ profession: profession.value })]),
  );
  const resourceProfessionFilterCounts = Object.fromEntries(
    resourceProfessions.map((profession) => [profession.value, countItemsForFilters({ profession: profession.value })]),
  );
  const statFilterCounts = Object.fromEntries(activeStatOptions.map((option) => {
    const statFilters = activeCategory === "weapons"
      ? [option.type]
      : activeStatSet.has(option.type) ? activeStatFilters : [...activeStatFilters, option.type];
    return [option.type, countItemsForFilters({ statFilters })];
  }));

  const searchItems = useMemo(() => dataset.items.map((item) => ({
    name: showEnglishNames ? item.englishName : item.name,
    englishName: item.englishName,
    slug: item.slug,
    meta: `${typeLabels[item.type] ?? item.type} · Тир ${item.tier}${item.type === "weapon" && item.mastery ? ` · ${weaponClassLabels[item.mastery] ?? item.mastery}` : ""}`,
    image: item.variations[0]?.image,
    aliases: [item.name, item.englishName],
  })), [dataset.items, showEnglishNames]);

  const filteredItems = dataset.items.filter((item) => itemMatchesCurrentFilters(item));
  const visibleItems = collectionFilter === "favorites"
    ? filteredItems.filter((item) => favoriteSet.has(item.slug))
    : collectionFilter === "recent"
      ? filteredItems
        .filter((item) => recentSet.has(item.slug))
        .sort((first, second) => recent.indexOf(first.slug) - recent.indexOf(second.slug))
      : filteredItems;

  const resetFilters = () => {
    updateCatalogState({ tier: "all", quality: "all", weaponClass: "all", profession: "all", statFilters: [], query: "" });
  };

  const updateQuery = (value: string) => {
    updateCatalogState({ query: value });
  };

  const toggleStatFilter = (statType: string) => {
    if (activeCategory === "weapons") {
      updateCatalogState({ statFilters: activeStatSet.has(statType) ? [] : [statType] });
      return;
    }
    updateCatalogState({
      statFilters: activeStatSet.has(statType)
        ? activeStatFilters.filter((type) => type !== statType)
        : [...activeStatFilters, statType],
    });
  };

  const rememberCatalogPosition = (slug: string) => {
    if (typeof window === "undefined") return;
    markViewed(slug);
    const href = `${pathname}${serializedSearchParams ? `?${serializedSearchParams}` : ""}`;
    saveCatalogRestore(href, window.scrollY, visibleLimit);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(CATALOG_RESTORE_KEY);
    if (!raw) return;
    try {
      const restore = JSON.parse(raw) as { href?: string; scrollY?: number; visibleLimit?: number; at?: number };
      const href = `${pathname}${serializedSearchParams ? `?${serializedSearchParams}` : ""}`;
      if (restore.href !== href || !restore.at || Date.now() - restore.at > 30 * 60 * 1000) return;
      window.requestAnimationFrame(() => {
        setVisibleLimit((value) => Math.max(value, restore.visibleLimit ?? PAGE_SIZE));
        window.requestAnimationFrame(() => window.scrollTo({ top: restore.scrollY ?? 0, behavior: "auto" }));
      });
      sessionStorage.removeItem(CATALOG_RESTORE_KEY);
    } catch {
      sessionStorage.removeItem(CATALOG_RESTORE_KEY);
    }
  }, [pathname, serializedSearchParams]);

  return (
    <div className={styles.catalogLayout}>
      <div className={styles.knowledgeTools}>
        <KnowledgeSearch items={searchItems} value={query} onChange={updateQuery} />
        <ItemNameLanguageToggle showEnglishNames={showEnglishNames} onChange={setShowEnglishNames} />
      </div>

      <div className={styles.collectionToolbar} role="group" aria-label="Персональная подборка предметов">
        <button type="button" className={collectionFilter === "all" ? styles.collectionActive : ""} onClick={() => setCollectionFilter("all")}>
          <LayoutGrid size={15} /> Все предметы
        </button>
        <button type="button" className={collectionFilter === "favorites" ? styles.collectionActive : ""} onClick={() => setCollectionFilter("favorites")}>
          <Star size={15} /> Избранное <small>{favorites.length}</small>
        </button>
        <button type="button" className={collectionFilter === "recent" ? styles.collectionActive : ""} onClick={() => setCollectionFilter("recent")}>
          <History size={15} /> Недавние <small>{recent.length}</small>
        </button>
      </div>

      <nav className={styles.categoryNav} aria-label="Разделы базы предметов">
        {categories.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            className={`${styles.categoryButton} ${activeCategory === id ? styles.categoryButtonActive : ""}`}
            onClick={() => updateCatalogState({ category: id, weaponClass: "all", profession: "all", statFilters: [] })}
            aria-pressed={activeCategory === id}
            data-testid={`category-${id}`}
            key={id}
          >
            <Icon size={19} />
            <span>{label}</span>
            <small>{categoryCounts[id]}</small>
          </button>
        ))}
      </nav>

      <section className={styles.catalogSection}>
        <header className={styles.categoryHeader}>
          <div className={styles.categoryIdentity}>
            <span><ActiveIcon size={22} /></span>
            <div><h2>{activeCategoryData.label}</h2><p>{activeCategoryData.description}</p></div>
          </div>
          <div className={styles.categoryCount}>{pluralItems(visibleItems.length)}</div>
        </header>

        <div className={styles.filtersPanel}>
          <div className={styles.filterGroup}>
            <span>Тир</span>
            <div>
              <button type="button" className={activeTier === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ tier: "all" })}>Все</button>
              {tiers.map((tier) => <button type="button" className={activeTier === tier ? styles.filterActive : ""} onClick={() => updateCatalogState({ tier })} key={tier}>T{tier}</button>)}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span>Качество</span>
            <div>
              <button type="button" className={activeQuality === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ quality: "all" })}>Все</button>
              {qualities.map((quality) => (
                <button type="button" className={`${activeQuality === quality ? styles.filterActive : ""} ${styles.qualityFilter}`} onClick={() => updateCatalogState({ quality })} key={quality} data-testid={`filter-quality-${quality}`}>
                  <i className={styles[quality]} /> {qualityLabels[quality]}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={styles.resetFilters} onClick={resetFilters}><RotateCcw size={14} /> Сбросить</button>

          {activeCategory === "weapons" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="weapon-class-filter">
              <span>Класс</span>
              <div>
                <button type="button" className={activeWeaponClass === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ weaponClass: "all" })} data-testid="filter-class-all">Все <small>{weaponClassAllCount}</small></button>
                {weaponClasses.map((weaponClass) => (
                  <button
                    type="button"
                    className={activeWeaponClass === weaponClass.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ weaponClass: weaponClass.value })}
                    data-testid={`filter-class-${weaponClass.value}`}
                    key={weaponClass.value}
                  >
                    {weaponClass.label} <small>{weaponClassFilterCounts[weaponClass.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeCategory === "consumables" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="consumable-profession-filter">
              <span>Профессия</span>
              <div>
                <button type="button" className={activeProfession === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ profession: "all" })} data-testid="filter-profession-all">Все <small>{consumableProfessionAllCount}</small></button>
                {consumableProfessions.map((profession) => (
                  <button
                    type="button"
                    className={activeProfession === profession.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ profession: profession.value })}
                    data-testid={`filter-profession-${profession.value}`}
                    key={profession.value}
                  >
                    {profession.label} <small>{consumableProfessionFilterCounts[profession.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeCategory === "resources" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="resource-profession-filter">
              <span>Профессия</span>
              <div>
                <button type="button" className={activeProfession === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ profession: "all" })} data-testid="filter-profession-all">Все <small>{resourceProfessionAllCount}</small></button>
                {resourceProfessions.map((profession) => (
                  <button
                    type="button"
                    className={activeProfession === profession.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ profession: profession.value })}
                    data-testid={`filter-profession-${profession.value}`}
                    key={profession.value}
                  >
                    {profession.label} <small>{resourceProfessionFilterCounts[profession.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(activeCategory === "weapons" || activeCategory === "artifacts") && activeStatOptions.length > 0 && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup} ${styles.statFilterGroup}`} data-testid="stat-filter">
              <span>Характеристики</span>
              <div>
                {activeStatOptions.map((option) => (
                  <button
                    type="button"
                    className={activeStatSet.has(option.type) ? styles.filterActive : ""}
                    onClick={() => toggleStatFilter(option.type)}
                    data-testid={`filter-stat-${option.type}`}
                    key={option.type}
                  >
                    {option.asset?.downloaded && <LoadableImage src={option.asset.local} alt="" width={18} height={18} />}
                    {option.label} <small>{statFilterCounts[option.type]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.catalogResults}>
          {visibleItems.length > 0 ? (
            <>
              <div className={styles.catalogResultMeta}>Найдено: {pluralItems(visibleItems.length)}</div>
              <div className={styles.catalogGrid}>
                {visibleItems.slice(0, visibleLimit).map((item) => {
                  const selectedVariation = activeQuality === "all"
                    ? item.variations.find((variation) => variation.quality === item.quality) ?? item.variations[0]
                    : item.variations.find((variation) => variation.quality === activeQuality) ?? item.variations[0];
                  return (
                    <article className={styles.catalogCard} data-testid={`catalog-item-${item.slug}`} key={item.slug}>
                      <Link className={styles.catalogCardLink} href={`/items/${item.slug}`} onClick={() => rememberCatalogPosition(item.slug)}>
                        <div className={styles.catalogImage}>
                          {selectedVariation?.image && <LoadableImage src={selectedVariation.image} alt={`${showEnglishNames ? item.englishName : item.name} ${selectedVariation.quality}`} width={128} height={128} />}
                          <span className={`${styles.qualityDot} ${styles[selectedVariation?.quality ?? item.quality]}`} />
                        </div>
                        <div className={styles.catalogBody}>
                          <div className={styles.cardEyebrow}>{typeLabels[item.type] ?? item.type} · Тир {item.tier}{item.type === "weapon" && item.mastery ? ` · ${weaponClassLabels[item.mastery] ?? item.mastery}` : ""}</div>
                          <h2>{showEnglishNames ? item.englishName : item.name}</h2>
                          <div className={styles.itemAvailability}>
                            {item.variations.map((variation) => <span className={styles[variation.quality]} key={variation.quality}>{qualityLabels[variation.quality] ?? variation.quality}</span>)}
                          </div>
                          {item.stats.length > 0 && (
                            <div className={styles.compactStats}>
                              {item.stats.slice(0, 3).map((stat) => {
                                const asset = dataset.stats[stat.type];
                                return <span key={stat.type}>{asset?.downloaded && <LoadableImage src={asset.local} alt="" width={18} height={18} />}[{stat.min}–{stat.max}] {asset?.label ?? stat.type}</span>;
                              })}
                            </div>
                          )}
                          <div className={styles.openCard}>Открыть полную карточку <ArrowRight size={16} /></div>
                        </div>
                      </Link>
                      <button
                        type="button"
                        className={`${styles.favoriteButton} ${favoriteSet.has(item.slug) ? styles.favoriteButtonActive : ""}`}
                        onClick={() => toggleFavorite(item.slug)}
                        aria-label={favoriteSet.has(item.slug) ? `Убрать ${item.name} из избранного` : `Добавить ${item.name} в избранное`}
                        title={favoriteSet.has(item.slug) ? "Убрать из избранного" : "Добавить в избранное"}
                      >
                        <Star size={16} fill={favoriteSet.has(item.slug) ? "currentColor" : "none"} />
                      </button>
                    </article>
                  );
                })}
              </div>
              {visibleLimit < visibleItems.length && (
                <button type="button" className={styles.loadMore} onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                  Показать ещё {Math.min(PAGE_SIZE, visibleItems.length - visibleLimit)}
                </button>
              )}
            </>
          ) : (
            <div className={styles.categoryEmpty}>
              <span><ActiveIcon size={25} /></span>
              <strong>Нет предметов с выбранными фильтрами</strong>
              <p>{collectionFilter === "favorites" ? "Добавьте предметы в избранное или переключитесь на полный каталог." : collectionFilter === "recent" ? "Открытые карточки предметов будут появляться здесь." : "Измените тир, качество или поисковый запрос."}</p>
              <button type="button" onClick={() => collectionFilter === "all" ? resetFilters() : setCollectionFilter("all")}>{collectionFilter === "all" ? "Сбросить фильтры" : "Показать все предметы"}</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
