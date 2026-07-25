"use client";

import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowRight,
  Gift,
  ListChecks,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/custom-select";
import { QuestRewardImage } from "@/components/quest-reward-image";
import type { LocalizedQuest, LocalizedRewardItem } from "@/lib/corepunk-quest-data";
import styles from "@/components/quest-library.module.css";

type QuestSort = "level-asc" | "level-desc" | "name" | "rewards";
const PAGE_SIZE = 24;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function rewardItems(quest: LocalizedQuest) {
  if (!quest.rewards) return [];
  const items = [
    ...quest.rewards.items,
    ...quest.rewards.itemGroups.flatMap((group) => group.items),
  ];
  return [...new Map(items.map((item) => [item.item, item])).values()];
}

function rewardCount(quest: LocalizedQuest) {
  if (!quest.rewards) return 0;
  return quest.rewards.items.length
    + quest.rewards.itemGroups.reduce((total, group) => total + group.items.length, 0);
}

function questSearchText(quest: LocalizedQuest) {
  const rewards = rewardItems(quest);
  return normalize([
    quest.name,
    quest.nameEn,
    quest.location,
    quest.locationEn,
    quest.questGiverName,
    quest.questGiverNameEn,
    quest.questFinisherName,
    quest.questFinisherNameEn,
    quest.description,
    ...quest.goals.flatMap((goal) => [goal.description, goal.descriptionEn, goal.itemName ?? "", goal.targetName ?? ""]),
    ...rewards.flatMap((item) => [item.name, item.nameEn]),
  ].join(" "));
}

function QuestRewardPreview({ items }: { items: LocalizedRewardItem[] }) {
  const visible = items.slice(0, 4);
  return (
    <span className={styles.taskRewardPreview} aria-label={`${items.length} вариантов предметов`}>
      {visible.map((item) => (
        <span className={styles.taskRewardIcon} key={item.item} title={item.name}>
          <QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={28} />
        </span>
      ))}
      {items.length > visible.length && <span className={styles.rewardOverflow}>+{items.length - visible.length}</span>}
    </span>
  );
}

export function QuestTaskCatalog({
  quests,
  locations,
  levels,
}: {
  quests: LocalizedQuest[];
  locations: string[];
  levels: number[];
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState<QuestSort>("level-asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const locationOptions = useMemo(
    () => [{ value: "all", label: "Все локации" }, ...locations.map((entry) => ({ value: entry, label: entry }))],
    [locations],
  );
  const levelOptions = useMemo(
    () => [{ value: "all", label: "Все уровни" }, ...levels.map((entry) => ({ value: String(entry), label: `Уровень ${entry}` }))],
    [levels],
  );
  const sortOptions = useMemo(() => [
    { value: "level-asc", label: "Сначала низкий уровень" },
    { value: "level-desc", label: "Сначала высокий уровень" },
    { value: "name", label: "По названию" },
    { value: "rewards", label: "По числу наград" },
  ], []);
  const searchIndex = useMemo(
    () => new Map(quests.map((quest) => [quest.slug, questSearchText(quest)])),
    [quests],
  );
  const filteredQuests = useMemo(() => {
    const normalizedQuery = normalize(query);
    return quests
      .filter((quest) => {
        const matchesQuery = !normalizedQuery || searchIndex.get(quest.slug)?.includes(normalizedQuery);
        const matchesLocation = location === "all" || quest.location === location;
        const matchesLevel = level === "all" || quest.level === Number(level);
        return matchesQuery && matchesLocation && matchesLevel;
      })
      .sort((first, second) => {
        if (sort === "level-desc") return second.level - first.level || first.name.localeCompare(second.name, "ru");
        if (sort === "name") return first.name.localeCompare(second.name, "ru");
        if (sort === "rewards") return rewardCount(second) - rewardCount(first) || first.level - second.level;
        return first.level - second.level || first.name.localeCompare(second.name, "ru");
      });
  }, [level, location, query, quests, searchIndex, sort]);
  const visibleQuests = filteredQuests.slice(0, visibleCount);

  const resetFilters = () => {
    setQuery("");
    setLocation("all");
    setLevel("all");
    setSort("level-asc");
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section className={styles.catalogShell}>
      <div className={styles.filterBar}>
        <label className={styles.searchField}>
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Название, NPC, цель или награда..."
          />
        </label>
        <CustomSelect
          value={location}
          options={locationOptions}
          onChange={(value) => {
            setLocation(value);
            setVisibleCount(PAGE_SIZE);
          }}
          ariaLabel="Локация"
          size="regular"
          startIcon={<MapPin size={16} />}
        />
        <CustomSelect
          value={level}
          options={levelOptions}
          onChange={(value) => {
            setLevel(value);
            setVisibleCount(PAGE_SIZE);
          }}
          ariaLabel="Уровень задания"
          size="regular"
          startIcon={<SlidersHorizontal size={16} />}
        />
        <CustomSelect
          className={styles.sortSelect}
          value={sort}
          options={sortOptions}
          onChange={(value) => {
            setSort(value as QuestSort);
            setVisibleCount(PAGE_SIZE);
          }}
          ariaLabel="Сортировка заданий"
          size="regular"
          startIcon={<ArrowDownAZ size={16} />}
        />
        <button className={styles.resetButton} type="button" onClick={resetFilters}>
          <RotateCcw size={15} /> Сбросить
        </button>
      </div>

      <div className={styles.resultsSummary} aria-live="polite">
        <strong>Найдено заданий: {filteredQuests.length}</strong>
        <span>Показано {visibleQuests.length} из {filteredQuests.length}</span>
      </div>

      {visibleQuests.length > 0 ? (
        <div className={styles.taskGrid}>
          {visibleQuests.map((quest) => {
            const rewards = rewardItems(quest);
            const rewardsTotal = rewardCount(quest);
            const description = quest.description.replace(/\s+/g, " ").trim();
            return (
              <Link className={styles.taskCard} href={`/quests/${quest.slug}`} key={quest.slug}>
                <div className={styles.taskCardHeader}>
                  <span className={styles.taskLevel}><small>ур.</small><strong>{quest.level}</strong></span>
                  <span className={styles.taskTitleCopy}>
                    <strong>{quest.name}</strong>
                    {quest.name !== quest.nameEn && <small>{quest.nameEn}</small>}
                  </span>
                  <span className={styles.taskArrow}><ArrowRight size={15} /></span>
                </div>

                <div className={styles.taskMeta}>
                  <span><MapPin size={13} /> {quest.location}</span>
                  <span><UserRound size={13} /> {quest.questGiverName}</span>
                </div>

                <p className={styles.taskDescription}>
                  {description || "Подробное описание задания доступно на странице квеста."}
                </p>

                <div className={styles.taskFooter}>
                  <span className={styles.taskCounters}>
                    <span><ListChecks size={13} /> {quest.goals.length} целей</span>
                    <span><Gift size={13} /> {rewardsTotal} наград</span>
                  </span>
                  {rewards.length > 0 && <QuestRewardPreview items={rewards} />}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Search size={25} />
          <strong>Задания не найдены</strong>
          <span>Измените поисковый запрос или сбросьте выбранные фильтры.</span>
          <button className={styles.resetButton} type="button" onClick={resetFilters}>Сбросить фильтры</button>
        </div>
      )}

      {visibleCount < filteredQuests.length && (
        <button className={styles.loadMore} type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
          Показать ещё <ArrowRight size={15} />
        </button>
      )}
    </section>
  );
}
