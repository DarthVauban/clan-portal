"use client";

import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  Coins,
  Gift,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { QuestRewardImage } from "@/components/quest-reward-image";
import type {
  LocalizedQuestRecipeRewardStat,
  LocalizedQuestRewardItemStat,
  LocalizedQuestRewardStats,
} from "@/lib/corepunk-quest-data";
import styles from "@/components/quest-library.module.css";

const typeLabels: Record<string, string> = {
  resource: "Ресурс",
  implant: "Имплант",
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

const linkableItemTypes = new Set(["weapon", "implant", "chip", "rune", "consumable", "resource"]);
const TOP_ITEMS_PAGE = 20;
const RECIPES_PAGE = 24;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
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
      <span className={styles.itemType}>{typeLabels[item.type] ?? item.type}</span>
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
  const [visibleItems, setVisibleItems] = useState(TOP_ITEMS_PAGE);
  const professionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of stats.recipes) counts.set(item.recipe, (counts.get(item.recipe) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: professionLabels[value] ?? value }))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, "ru"));
  }, [stats.recipes]);
  const [profession, setProfession] = useState(professionOptions[0]?.value ?? "all");
  const [visibleRecipes, setVisibleRecipes] = useState(RECIPES_PAGE);
  const rankByItem = useMemo(
    () => new Map(stats.topItems.map((item, index) => [item.item, index + 1])),
    [stats.topItems],
  );
  const topItemTypes = useMemo(
    () => [...new Set(stats.topItems.map((item) => item.type))],
    [stats.topItems],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = normalize(query);
    return stats.topItems.filter((item) => {
      const matchesType = type === "all" || item.type === type;
      const matchesQuery = !normalizedQuery || normalize(`${item.name} ${item.nameEn}`).includes(normalizedQuery);
      return matchesType && matchesQuery;
    });
  }, [query, stats.topItems, type]);
  const recipeItems = useMemo(
    () => stats.recipes
      .filter((item) => profession === "all" || item.recipe === profession)
      .sort((first, second) => second.questCount - first.questCount || first.name.localeCompare(second.name, "ru")),
    [profession, stats.recipes],
  );
  const maxTypeEntries = Math.max(...stats.byType.map((entry) => entry.entryCount), 1);

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
              <Search size={16} />
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
            <label className={styles.selectField}>
              <PackageSearch size={16} />
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setVisibleItems(TOP_ITEMS_PAGE);
                }}
                aria-label="Тип предмета"
              >
                <option value="all">Все типы</option>
                {topItemTypes.map((entry) => <option value={entry} key={entry}>{typeLabels[entry] ?? entry}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
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
              <span>Измените название предмета или выбранный тип.</span>
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
          <p>Предметы, рецепты которых можно получить за выполнение заданий.</p>
        </header>

        <div className={styles.professionTabs} aria-label="Профессии рецептов">
          {professionOptions.map((entry) => (
            <button
              className={profession === entry.value ? styles.professionTabActive : undefined}
              type="button"
              onClick={() => {
                setProfession(entry.value);
                setVisibleRecipes(RECIPES_PAGE);
              }}
              aria-pressed={profession === entry.value}
              key={entry.value}
            >
              {entry.label}<em>{entry.count}</em>
            </button>
          ))}
        </div>

        <div className={styles.recipeGrid}>
          {recipeItems.slice(0, visibleRecipes).map((item) => (
            <RecipeRewardItem item={item} key={`${item.recipe}-${item.item}`} />
          ))}
        </div>

        {visibleRecipes < recipeItems.length && (
          <button className={styles.loadMore} type="button" onClick={() => setVisibleRecipes((current) => current + RECIPES_PAGE)}>
            Показать ещё <Gift size={15} />
          </button>
        )}
      </section>
    </div>
  );
}
