import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { QuestRewardStatistics } from "@/components/quest-reward-statistics";
import { QuestSectionNav } from "@/components/quest-section-nav";
import { getQuestRewardStatistics } from "@/lib/corepunk-quest-repository";
import styles from "@/components/quest-library.module.css";

export const metadata: Metadata = {
  title: "Статистика наград",
  description: "Статистика предметов, валюты, опыта и рецептов в наградах за задания Corepunk.",
};

export default function QuestRewardStatsPage() {
  const stats = getQuestRewardStatistics();
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>Статистика наград</h1>
          <p>Сводная аналитика по всем наградам за задания: самые частые предметы, распределение по типам, экономика и рецепты для каждой профессии.</p>
        </div>
        <div className={styles.heroBadge}><BarChart3 size={17} /> {stats.summary.totalRewardEntries.toLocaleString("ru-RU")} наград</div>
      </section>

      <QuestSectionNav />
      <QuestRewardStatistics stats={stats} />
    </div>
  );
}
