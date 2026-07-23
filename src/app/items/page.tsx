import { Database } from "lucide-react";
import { KnowledgeCatalog } from "@/components/knowledge-catalog";
import { getCatalogDataset, getItemDatabaseCounts } from "@/lib/corepunk-item-repository";
import styles from "./item-card.module.css";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [catalogDataset, itemDatabaseCounts] = await Promise.all([getCatalogDataset(), getItemDatabaseCounts()]);
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
      <KnowledgeCatalog dataset={catalogDataset} />
    </div>
  );
}
