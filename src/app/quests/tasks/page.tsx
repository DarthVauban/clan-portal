import type { Metadata } from "next";
import { Gift, Layers3, ListTodo, MapPin } from "lucide-react";
import { QuestSectionNav } from "@/components/quest-section-nav";
import { QuestTaskCatalog } from "@/components/quest-task-catalog";
import { getQuestDirectory } from "@/lib/corepunk-quest-repository";
import styles from "@/components/quest-library.module.css";

export const metadata: Metadata = {
  title: "Задания",
  description: "Полный переведённый каталог заданий Corepunk с поиском по уровню, локации, NPC, целям и наградам.",
};

export default function QuestTasksPage() {
  const directory = getQuestDirectory();
  const minLevel = Math.min(...directory.levels);
  const maxLevel = Math.max(...directory.levels);

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>Задания</h1>
          <p>Полный каталог квестов с переведёнными названиями, целями, NPC и наградами. Используйте быстрые фильтры или поиск по любому известному фрагменту задания.</p>
        </div>
        <div className={styles.heroBadge}><ListTodo size={17} /> {directory.quests.length} заданий</div>
      </section>

      <QuestSectionNav />

      <section className={styles.overviewGrid} aria-label="Сводка каталога заданий">
        <div className={styles.overviewCard}><span className={styles.overviewIcon}><ListTodo size={18} /></span><small>Всего заданий</small><strong>{directory.quests.length}</strong></div>
        <div className={styles.overviewCard}><span className={styles.overviewIcon}><MapPin size={18} /></span><small>Локаций</small><strong>{directory.locations.length}</strong></div>
        <div className={styles.overviewCard}><span className={styles.overviewIcon}><Layers3 size={18} /></span><small>Диапазон уровней</small><strong>{minLevel}–{maxLevel}</strong></div>
        <div className={styles.overviewCard}><span className={styles.overviewIcon}><Gift size={18} /></span><small>С наградами</small><strong>{directory.questsWithRewards}</strong></div>
      </section>

      <QuestTaskCatalog quests={directory.quests} locations={directory.locations} levels={directory.levels} />
    </div>
  );
}
