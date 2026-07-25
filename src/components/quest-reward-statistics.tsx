"use client";

import Link from "next/link";
import {
  ArrowDownAZ,
  BarChart3,
  Coins,
  Gift,
  Layers3,
  PackageSearch,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/custom-select";
import { LoadableImage } from "@/components/loadable-image";
import { QuestRewardImage } from "@/components/quest-reward-image";
import type {
  LocalizedQuestRecipeRewardStat,
  LocalizedQuestRewardItemStat,
  LocalizedQuestRewardStats,
} from "@/lib/corepunk-quest-data";
import styles from "@/components/quest-library.module.css";

const typeLabels: Record<string, string> = {
  resource: "Ресурс",
  implant: "Артефакт",
  consumable: "Расходник",
  chip: "Чип",
  weapon: "Оружие",
  skin: "Облик",
  rune: "Руна",
  "quest-item": "Квестовый предмет",
};

const professionLabels: Record<string, string> = {
  alchemy: "Алхимия",
  construction: "Конструирование",
  cooking: "Кулинария",
  mysticism: "Мистика",
  weaponsmithing: "Оружейное дело",
};

const masteryLabels: Record<string, string> = {
  legionnary: "Легионер",
  shaman: "Шаман",
  ranger: "Рейнджер",
  destroyer: "Разрушитель",
  defender: "Защитник",
  "blast-medic": "Взрывной медик",
  infiltrator: "Инфильтратор",
};

const qualityLabels: Record<string, string> = {
  common: "Обычное",
  uncommon: "Необычное",
  rare: "Редкое",
  epic: "Эпическое",
};

const qualityOrder = ["common", "uncommon", "rare", "epic"];
const linkableItemTypes = new Set(["weapon", "implant", "chip", "rune", "consumable", "resource"]);
const TOP_ITEMS_PAGE = 20;
const RECIPES_PAGE = 24;

type TopItemSort = "quests-desc" | "quantity-desc" | "tier-desc" | "name";

type RecipeFilterState = {
  query: string;
  type: string;
  tier: string;
  quality: string;
  mastery: string;
  statTypes: string[];
};

const initialRecipeFilters: RecipeFilterState = {
  query: "",
  type: "all",
  tier: "all",
  quality: "all",
  mastery: "all",
  statTypes: [],
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function orderedQualities(values: string[]) {
  return [...new Set(values)].sort((first, second) => {
    const firstIndex = qualityOrder.indexOf(first);
    const secondIndex = qualityOrder.indexOf(second);
    if (firstIndex < 0 && secondIndex < 0) return first.localeCompare(second, "ru");
    if (firstIndex < 0) return 1;
    if (secondIndex < 0) return -1;
    return firstIndex - secondIndex;
  });
}

function recipeMatches(item: LocalizedQuestRecipeRewardStat, filters: RecipeFilterState) {
  const normalizedQuery = normalize(filters.query);
  return (
    (!normalizedQuery || normalize(`${item.name} ${item.nameEn}`).includes(normalizedQuery))
    && (filters.type === "all" || item.type === filters.type)
    && (filters.tier === "all" || item.tier === Number(filters.tier))
    && (filters.quality === "all" || item.qualities.includes(filters.quality))
    && (filters.mastery === "all" || item.mastery === filters.mastery)
    && (filters.statTypes.length === 0 || filters.statTypes.every((statType) => item.statTypes.includes(statType)))
  );
}

function TopRewardItem({ item, rank }: { item: LocalizedQuestRewardItemStat; rank: number }) {
  const content = (
    <>
      <span className={styles.itemRank}>{String(rank).padStart(2, "0")}</span>
      <span className={styles.statItemIcon}>
        <QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={42} />
      </span>
      <span className={styles.statItemCopy}>
        <strong>{item.name}</strong>
        {item.name !== item.nameEn && <small>{item.nameEn}</small>}
      </span>
      <span className={styles.itemType}>{typeLabels[item.type] ?? item.type} · T{item.tier}</span>
      <span className={styles.itemFrequency}>
        <strong>{item.questCount}</strong>
        <small>квестов · {item.totalQuantity} шт.</small>
      </span>
    </>
  );

  return linkableItemTypes.has(item.type)
    ? <Link className={styles.topItemRow} href={`/items/${item.item}`}>{content}</Link>
    : <div className={styles.topItemRow}>{content}</div>;
}

function RecipeRewardItem({ item }: { item: LocalizedQuestRecipeRewardStat }) {
  const content = (
    <>
      <span className={styles.recipeItemIcon}>
        <QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={46} />
      </span>
      <span className={styles.recipeCopy}>
        <strong>{item.name}</strong>
        {item.name !== item.nameEn && <small>{item.nameEn}</small>}
        <em>T{item.tier} · {typeLabels[item.type] ?? item.type}</em>
      </span>
      <span className={styles.recipeCount} title={`${item.questCount} заданий`}>{item.questCount}</span>
    </>
  );

  return linkableItemTypes.has(item.type)
    ? <Link className={styles.recipeCard} href={`/items/${item.item}`}>{content}</Link>
    : <div className={styles.recipeCard}>{content}</div>;
}

export function QuestRewardStatistics({ stats }: { stats: LocalizedQuestRewardStats }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [tier, setTier] = useState("all");
  const [quality, setQuality] = useState("all");
  const [sort, setSort] = useState<TopItemSort>("quests-desc");
  const [visibleItems, setVisibleItems] = useState(TOP_ITEMS_PAGE);
  const professionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of stats.recipes) counts.set(item.recipe, (counts.get(item.recipe) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: professionLabels[value] ?? value }))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, "ru"));
  }, [stats.recipes]);
  const [profession, setProfession] = useState(professionOptions[0]?.value ?? "all");
  const [recipeFilters, setRecipeFilters] = useState<RecipeFilterState>(initialRecipeFilters);
  const [visibleRecipes, setVisibleRecipes] = useState(RECIPES_PAGE);
  const rankByItem = useMemo(
    () => new Map(stats.topItems.map((item, index) => [item.item, index + 1])),
    [stats.topItems],
  );
  const topTypeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of stats.topItems) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    return [
      { value: "all", label: `Все типы · ${stats.topItems.length}` },
      ...[...counts.entries()]
        .map(([value, count]) => ({ value, label: `${typeLabels[value] ?? value} · ${count}` }))
        .sort((first, second) => first.label.localeCompare(second.label, "ru")),
    ];
  }, [stats.topItems]);
  const topTierOptions = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of stats.topItems) counts.set(item.tier, (counts.get(item.tier) ?? 0) + 1);
    return [
      { value: "all", label: "Все тиры" },
      ...[...counts.entries()]
        .sort(([first], [second]) => first - second)
        .map(([value, count]) => ({ value: String(value), label: `Тир ${value} · ${count}` })),
    ];
  }, [stats.topItems]);
  const topQualityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of stats.topItems) counts.set(item.quality, (counts.get(item.quality) ?? 0) + 1);
    return [
      { value: "all", label: "Все качества" },
      ...orderedQualities([...counts.keys()]).map((value) => ({
        value,
        label: `${qualityLabels[value] ?? value} · ${counts.get(value)}`,
      })),
    ];
  }, [stats.topItems]);
  const topSortOptions = useMemo(() => [
    { value: "quests-desc", label: "По числу заданий" },
    { value: "quantity-desc", label: "По количеству предметов" },
    { value: "tier-desc", label: "Сначала высокий тир" },
    { value: "name", label: "По названию" },
  ], []);
  const filteredItems = useMemo(() => {
    const normalizedQuery = normalize(query);
    return stats.topItems
      .filter((item) => (
        (!normalizedQuery || normalize(`${item.name} ${item.nameEn}`).includes(normalizedQuery))
        && (type === "all" || item.type === type)
        && (tier === "all" || item.tier === Number(tier))
        && (quality === "all" || item.quality === quality)
      ))
      .sort((first, second) => {
        if (sort === "quantity-desc") return second.totalQuantity - first.totalQuantity || second.questCount - first.questCount;
        if (sort === "tier-desc") return second.tier - first.tier || second.questCount - first.questCount;
        if (sort === "name") return first.name.localeCompare(second.name, "ru");
        return second.questCount - first.questCount || second.totalQuantity - first.totalQuantity;
      });
  }, [quality, query, sort, stats.topItems, tier, type]);
  const professionItems = useMemo(
    () => stats.recipes.filter((item) => profession === "all" || item.recipe === profession),
    [profession, stats.recipes],
  );
  const recipeTypes = useMemo(
    () => [...new Set(professionItems.map((item) => item.type))].sort((first, second) => (typeLabels[first] ?? first).localeCompare(typeLabels[second] ?? second, "ru")),
    [professionItems],
  );
  const recipeContextItems = useMemo(
    () => professionItems.filter((item) => recipeFilters.type === "all" || item.type === recipeFilters.type),
    [professionItems, recipeFilters.type],
  );
  const recipeTiers = useMemo(
    () => [...new Set(recipeContextItems.map((item) => item.tier))].sort((first, second) => first - second),
    [recipeContextItems],
  );
  const recipeQualities = useMemo(
    () => orderedQualities(recipeContextItems.flatMap((item) => item.qualities)),
    [recipeContextItems],
  );
  const recipeMasteries = useMemo(
    () => [...new Set(recipeContextItems.map((item) => item.mastery).filter((value): value is string => Boolean(value)))]
      .sort((first, second) => (masteryLabels[first] ?? first).localeCompare(masteryLabels[second] ?? second, "ru")),
    [recipeContextItems],
  );
  const effectiveRecipeType = recipeFilters.type !== "all"
    ? recipeFilters.type
    : recipeTypes.length === 1 ? recipeTypes[0] : null;
  const recipeStatTypes = useMemo(
    () => [...new Set(recipeContextItems.flatMap((item) => item.statTypes))]
      .sort((first, second) => (stats.statAssets[first]?.label ?? first).localeCompare(stats.statAssets[second]?.label ?? second, "ru")),
    [recipeContextItems, stats.statAssets],
  );
  const filteredRecipes = useMemo(
    () => professionItems
      .filter((item) => recipeMatches(item, recipeFilters))
      .sort((first, second) => second.questCount - first.questCount || first.name.localeCompare(second.name, "ru")),
    [professionItems, recipeFilters],
  );
  const countRecipes = (overrides: Partial<RecipeFilterState> = {}) => {
    const filters = { ...recipeFilters, ...overrides };
    return professionItems.filter((item) => recipeMatches(item, filters)).length;
  };
  const updateRecipeFilters = (updates: Partial<RecipeFilterState>) => {
    setRecipeFilters((current) => ({ ...current, ...updates }));
    setVisibleRecipes(RECIPES_PAGE);
  };
  const changeRecipeType = (nextType: string) => {
    updateRecipeFilters({
      type: nextType,
      tier: "all",
      quality: "all",
      mastery: "all",
      statTypes: [],
    });
  };
  const toggleRecipeStat = (statType: string) => {
    if (effectiveRecipeType === "weapon") {
      updateRecipeFilters({ statTypes: recipeFilters.statTypes.includes(statType) ? [] : [statType] });
      return;
    }
    updateRecipeFilters({
      statTypes: recipeFilters.statTypes.includes(statType)
        ? recipeFilters.statTypes.filter((value) => value !== statType)
        : [...recipeFilters.statTypes, statType],
    });
  };
  const resetTopFilters = () => {
    setQuery("");
    setType("all");
    setTier("all");
    setQuality("all");
    setSort("quests-desc");
    setVisibleItems(TOP_ITEMS_PAGE);
  };
  const maxTypeEntries = Math.max(...stats.byType.map((entry) => entry.entryCount), 1);
  const qualityClassNames: Record<string, string> = {
    common: styles.qualityCommon,
    uncommon: styles.qualityUncommon,
    rare: styles.qualityRare,
    epic: styles.qualityEpic,
  };

  return (
    <div className={styles.catalogShell}>
      <section className={styles.statsSummaryGrid} aria-label="Сводка наград">
        <div className={styles.statsSummaryCard}><span><Gift size={18} /></span><small>Квестов с наградами</small><strong>{stats.summary.questsWithRewards.toLocaleString("ru-RU")}</strong></div>
        <div className={styles.statsSummaryCard}><span><Sparkles size={18} /></span><small>Записей наград</small><strong>{stats.summary.totalRewardEntries.toLocaleString("ru-RU")}</strong></div>
        <div className={styles.statsSummaryCard}><span><PackageSearch size={18} /></span><small>Уникальных предметов</small><strong>{stats.summary.uniqueItems.toLocaleString("ru-RU")}</strong></div>
        <div className={styles.statsSummaryCard}><span><ShieldCheck size={18} /></span><small>Гарантированных выдач</small><strong>{stats.summary.guaranteedCount.toLocaleString("ru-RU")}</strong></div>
        <div className={styles.statsSummaryCard}><span><BarChart3 size={18} /></span><small>Типов предметов</small><strong>{stats.byType.length}</strong></div>
        <div className={styles.statsSummaryCard}><span><Coins size={18} /></span><small>Всего золота</small><strong>{stats.summary.totalGold.toLocaleString("ru-RU")}</strong></div>
        <div className={styles.statsSummaryCard}><span><Star size={18} /></span><small>Всего опыта</small><strong>{stats.summary.totalXp.toLocaleString("ru-RU")}</strong></div>
      </section>

      <div className={styles.statsColumns}>
        <section className={styles.statsPanel}>
          <header className={styles.statsPanelHeader}>
            <div><span>Частота выдачи</span><h2>Самые частые награды</h2></div>
            <p>Предметы отсортированы по числу заданий, в которых они встречаются.</p>
          </header>

          <div className={styles.statFilters}>
            <label className={styles.searchField}>
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                placeholder="Найти предмет..."
              />
            </label>
            <div className={styles.statFilterControls}>
              <CustomSelect
                value={type}
                options={topTypeOptions}
                onChange={(value) => {
                  setType(value);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                ariaLabel="Тип предмета"
                size="regular"
                startIcon={<PackageSearch size={16} />}
              />
              <CustomSelect
                value={tier}
                options={topTierOptions}
                onChange={(value) => {
                  setTier(value);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                ariaLabel="Тир предмета"
                size="regular"
                startIcon={<Layers3 size={16} />}
              />
              <CustomSelect
                value={quality}
                options={topQualityOptions}
                onChange={(value) => {
                  setQuality(value);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                ariaLabel="Качество предмета"
                size="regular"
                startIcon={<Sparkles size={16} />}
              />
              <CustomSelect
                value={sort}
                options={topSortOptions}
                onChange={(value) => {
                  setSort(value as TopItemSort);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                ariaLabel="Сортировка наград"
                size="regular"
                startIcon={<ArrowDownAZ size={16} />}
              />
              <button className={styles.resetButton} type="button" onClick={resetTopFilters}>
                <RotateCcw size={15} /> Сбросить
              </button>
            </div>
          </div>

          <div className={styles.resultsSummary} aria-live="polite">
            <strong>Найдено наград: {filteredItems.length}</strong>
            <span>Показано {Math.min(visibleItems, filteredItems.length)} из {filteredItems.length}</span>
          </div>

          {filteredItems.length > 0 ? (
            <div className={styles.topItemList}>
              {filteredItems.slice(0, visibleItems).map((item) => (
                <TopRewardItem item={item} rank={rankByItem.get(item.item) ?? 0} key={item.item} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Search size={24} />
              <strong>Награды не найдены</strong>
              <span>Измените запрос или сбросьте выбранные фильтры.</span>
              <button className={styles.resetButton} type="button" onClick={resetTopFilters}>Сбросить фильтры</button>
            </div>
          )}

          {visibleItems < filteredItems.length && (
            <button className={styles.loadMore} type="button" onClick={() => setVisibleItems((current) => current + TOP_ITEMS_PAGE)}>
              Показать ещё <Gift size={15} />
            </button>
          )}
        </section>

        <aside className={styles.statsPanel}>
          <header className={styles.statsPanelHeader}>
            <div><span>Структура добычи</span><h2>По типам предметов</h2></div>
          </header>
          <div className={styles.typeBreakdown}>
            {stats.byType.map((entry) => (
              <div className={styles.typeRow} key={entry.type}>
                <div className={styles.typeRowHeader}>
                  <strong>{typeLabels[entry.type] ?? entry.type}</strong>
                  <span>{entry.entryCount.toLocaleString("ru-RU")} выдач · {entry.uniqueItems} предметов</span>
                </div>
                <div className={styles.typeTrack}><i style={{ width: `${Math.max(4, (entry.entryCount / maxTypeEntries) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className={`${styles.statsPanel} ${styles.recipePanel}`}>
        <header className={styles.statsPanelHeader}>
          <div><span>Профессии</span><h2>Рецепты в наградах</h2></div>
          <p>Для каждой профессии показаны только подходящие ей фильтры.</p>
        </header>

        <div className={styles.professionTabs} aria-label="Профессии рецептов">
          {professionOptions.map((entry) => (
            <button
              className={profession === entry.value ? styles.professionTabActive : undefined}
              type="button"
              onClick={() => {
                setProfession(entry.value);
                setRecipeFilters(initialRecipeFilters);
                setVisibleRecipes(RECIPES_PAGE);
              }}
              aria-pressed={profession === entry.value}
              key={entry.value}
            >
              {entry.label}<em>{entry.count}</em>
            </button>
          ))}
        </div>

        <div className={styles.recipeFilters}>
          <div className={styles.recipeFilterToolbar}>
            <label className={styles.searchField}>
              <Search size={17} />
              <input
                type="search"
                value={recipeFilters.query}
                onChange={(event) => updateRecipeFilters({ query: event.target.value })}
                placeholder="Найти рецепт или предмет..."
              />
            </label>
            <button
              className={styles.resetButton}
              type="button"
              onClick={() => {
                setRecipeFilters(initialRecipeFilters);
                setVisibleRecipes(RECIPES_PAGE);
              }}
            >
              <RotateCcw size={15} /> Сбросить
            </button>
          </div>

          {recipeTypes.length > 1 && (
            <div className={styles.recipeFilterGroup}>
              <span>Тип предмета</span>
              <div>
                <button className={recipeFilters.type === "all" ? styles.recipeFilterActive : undefined} type="button" onClick={() => changeRecipeType("all")}>
                  Все <small>{professionItems.length}</small>
                </button>
                {recipeTypes.map((itemType) => (
                  <button className={recipeFilters.type === itemType ? styles.recipeFilterActive : undefined} type="button" onClick={() => changeRecipeType(itemType)} key={itemType}>
                    {typeLabels[itemType] ?? itemType} <small>{countRecipes({ type: itemType, tier: "all", quality: "all", mastery: "all", statTypes: [] })}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {recipeTiers.length > 1 && (
            <div className={styles.recipeFilterGroup}>
              <span>Тир</span>
              <div>
                <button className={recipeFilters.tier === "all" ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ tier: "all" })}>
                  Все <small>{countRecipes({ tier: "all" })}</small>
                </button>
                {recipeTiers.map((itemTier) => (
                  <button className={recipeFilters.tier === String(itemTier) ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ tier: String(itemTier) })} key={itemTier}>
                    T{itemTier} <small>{countRecipes({ tier: String(itemTier) })}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {recipeQualities.length > 1 && (
            <div className={styles.recipeFilterGroup}>
              <span>Качество</span>
              <div>
                <button className={recipeFilters.quality === "all" ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ quality: "all" })}>
                  Все <small>{countRecipes({ quality: "all" })}</small>
                </button>
                {recipeQualities.map((itemQuality) => (
                  <button className={recipeFilters.quality === itemQuality ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ quality: itemQuality })} key={itemQuality}>
                    <i className={`${styles.filterQualityDot} ${qualityClassNames[itemQuality] ?? ""}`} />
                    {qualityLabels[itemQuality] ?? itemQuality} <small>{countRecipes({ quality: itemQuality })}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {effectiveRecipeType === "weapon" && recipeMasteries.length > 1 && (
            <div className={styles.recipeFilterGroup}>
              <span>Класс</span>
              <div>
                <button className={recipeFilters.mastery === "all" ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ mastery: "all" })}>
                  Все <small>{countRecipes({ mastery: "all" })}</small>
                </button>
                {recipeMasteries.map((mastery) => (
                  <button className={recipeFilters.mastery === mastery ? styles.recipeFilterActive : undefined} type="button" onClick={() => updateRecipeFilters({ mastery })} key={mastery}>
                    {masteryLabels[mastery] ?? mastery} <small>{countRecipes({ mastery })}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {["weapon", "implant"].includes(effectiveRecipeType ?? "") && recipeStatTypes.length > 0 && (
            <div className={styles.recipeFilterGroup}>
              <span>Характеристики</span>
              <div>
                {recipeStatTypes.map((statType) => {
                  const asset = stats.statAssets[statType];
                  const active = recipeFilters.statTypes.includes(statType);
                  const nextStats = effectiveRecipeType === "weapon"
                    ? [statType]
                    : active ? recipeFilters.statTypes : [...recipeFilters.statTypes, statType];
                  return (
                    <button className={active ? styles.recipeFilterActive : undefined} type="button" onClick={() => toggleRecipeStat(statType)} key={statType}>
                      {asset?.image && <LoadableImage src={asset.image} alt="" width={18} height={18} />}
                      {asset?.label ?? statType.toUpperCase()} <small>{countRecipes({ statTypes: nextStats })}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className={styles.resultsSummary} aria-live="polite">
          <strong>Найдено рецептов: {filteredRecipes.length}</strong>
          <span>Показано {Math.min(visibleRecipes, filteredRecipes.length)} из {filteredRecipes.length}</span>
        </div>

        {filteredRecipes.length > 0 ? (
          <div className={styles.recipeGrid}>
            {filteredRecipes.slice(0, visibleRecipes).map((item) => (
              <RecipeRewardItem item={item} key={`${item.recipe}-${item.item}`} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Search size={24} />
            <strong>Рецепты не найдены</strong>
            <span>Измените запрос или параметры текущей профессии.</span>
            <button className={styles.resetButton} type="button" onClick={() => setRecipeFilters(initialRecipeFilters)}>Сбросить фильтры</button>
          </div>
        )}

        {visibleRecipes < filteredRecipes.length && (
          <button className={styles.loadMore} type="button" onClick={() => setVisibleRecipes((current) => current + RECIPES_PAGE)}>
            Показать ещё <Gift size={15} />
          </button>
        )}
      </section>
    </div>
  );
}
