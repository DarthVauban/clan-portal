import type { Metadata } from "next";
import { GitBranch, Layers3, MapPin, ScrollText, Sparkles } from "lucide-react";
import { QuestChainExplorer } from "@/components/quest-chain-explorer";
import { QuestSectionNav } from "@/components/quest-section-nav";
import { getQuestCatalog } from "@/lib/corepunk-quest-repository";
import styles from "@/app/quests/quests.module.css";

export const metadata: Metadata = {
  title: "Цепочки заданий",
  description: "Переведённые цепочки заданий Corepunk: порядок прохождения, зависимости, уровни, NPC, цели и награды.",
};

export default function QuestChainsPage() {
  const catalog = getQuestCatalog();
  const sourceDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(catalog.scrapedAt));

  return (
    <div className="page-stack">
      <section className={`${styles.chainsHero} page-hero`}>
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>Цепочки заданий</h1>
          <p>Полная карта зависимостей между квестами: найдите стартовую точку, раскройте нужную ветку и переходите к подробному переведённому описанию каждого этапа.</p>
        </div>
        <div className={styles.importBadge}><Sparkles size={15} /> Данные обновлены {sourceDate}</div>
      </section>

      <QuestSectionNav />

      <section className={styles.catalogSummary} aria-label="Сводка каталога квестов">
        <div><span><GitBranch size={17} /></span><small>Цепочек</small><strong>{catalog.counts.chains}</strong></div>
        <div><span><ScrollText size={17} /></span><small>Связанных квестов</small><strong>{catalog.counts.quests}</strong></div>
        <div><span><Layers3 size={17} /></span><small>Самая глубокая ветка</small><strong>{Math.max(...catalog.chains.map((chain) => chain.maxDepth))}</strong></div>
        <div><span><MapPin size={17} /></span><small>Стартовых локаций</small><strong>{catalog.locations.length}</strong></div>
      </section>

      <QuestChainExplorer chains={catalog.chains} locations={catalog.locations} />

      <p className={styles.sourceNote}>
        Данные импортированы из <a href="https://corepunk.help/quests/chains" target="_blank" rel="noreferrer">Corepunk Help</a>.
        Названия, цели и описания переведены и адаптированы для портала; английские оригиналы сохранены рядом для точного поиска.
      </p>
    </div>
  );
}
