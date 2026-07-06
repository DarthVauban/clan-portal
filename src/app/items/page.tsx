import { Database } from "lucide-react";
import { Suspense } from "react";
import { KnowledgeCatalog } from "@/components/knowledge-catalog";
import { catalogDataset, itemDatabaseCounts } from "@/lib/corepunk-item-data";
import styles from "./item-card.module.css";

export default function ItemsPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>База предметов</h1>
          <p>Полный каталог игровых предметов по категориям с поиском и фильтрами по тиру и качеству.</p>
        </div>
        <div className={styles.importBadge}><Database size={15} /> Импортировано: {itemDatabaseCounts.uniqueBaseItems} предмет</div>
      </section>
      <Suspense fallback={null}>
        <KnowledgeCatalog dataset={catalogDataset} />
      </Suspense>
    </div>
  );
}
