import { Database } from "lucide-react";
import { KnowledgeCatalog } from "@/components/knowledge-catalog";
import { itemDataset } from "@/lib/corepunk-item-data";
import styles from "./item-card.module.css";

export default function ItemsPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>База предметов</h1>
          <p>Каталог игровых предметов по категориям с поиском, фильтрами по тиру и качеству.</p>
        </div>
        <div className={styles.importBadge}><Database size={15} /> Импортировано: 1 предмет</div>
      </section>
      <KnowledgeCatalog dataset={itemDataset} />
    </div>
  );
}
