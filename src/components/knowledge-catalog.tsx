"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cpu,
  FlaskConical,
  Gem,
  Hexagon,
  RotateCcw,
  Swords,
} from "lucide-react";
import { useMemo, useState } from "react";
import { KnowledgeSearch } from "@/components/knowledge-search";
import { type CorepunkItemDataset, formatQuality } from "@/lib/corepunk-item-data";
import styles from "@/app/items/item-card.module.css";

const categories = [
  { id: "weapons", label: "Оружие", description: "Клинки, огнестрельное и магическое оружие", icon: Swords },
  { id: "artifacts", label: "Артефакты", description: "Импланты и экипируемые артефакты", icon: Gem },
  { id: "chips", label: "Чипы", description: "Боевые и вспомогательные чипы", icon: Cpu },
  { id: "runes", label: "Руны", description: "Руны усиления и модификации", icon: Hexagon },
  { id: "consumables", label: "Расходные материалы", description: "Еда, зелья, рецепты и расходники", icon: FlaskConical },
  { id: "resources", label: "Ресурсы", description: "Сырьё и материалы для крафта", icon: Boxes },
] as const;

const tiers = [1, 2, 3] as const;
const qualities = ["common", "uncommon", "rare", "epic"] as const;

export function KnowledgeCatalog({ dataset }: { dataset: CorepunkItemDataset }) {
  const item = dataset.records.find((record) => record.slug === dataset.rootSlug)!;
  const variations = dataset.records.filter((record) => record.slug === item.slug || record.baseSlug === item.slug);
  const [activeCategory, setActiveCategory] = useState("artifacts");
  const [activeTier, setActiveTier] = useState<number | "all">("all");
  const [activeQuality, setActiveQuality] = useState<string | "all">("all");
  const [query, setQuery] = useState("");

  const searchItems = [{
    name: item.name,
    slug: item.slug,
    meta: `Артефакт · Tier ${item.tier}`,
    image: dataset.media.items[item.slug]?.local,
  }];

  const selectedVariation = activeQuality === "all"
    ? item
    : variations.find((variation) => variation.quality === activeQuality) ?? item;

  const visible = useMemo(() => {
    const matchesCategory = activeCategory === "artifacts";
    const matchesTier = activeTier === "all" || item.tier === activeTier;
    const matchesQuality = activeQuality === "all" || variations.some((variation) => variation.quality === activeQuality);
    const matchesQuery = item.name.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"));
    return matchesCategory && matchesTier && matchesQuality && matchesQuery;
  }, [activeCategory, activeQuality, activeTier, item.name, item.tier, query, variations]);

  const activeCategoryData = categories.find((category) => category.id === activeCategory)!;
  const ActiveIcon = activeCategoryData.icon;
  const activeImage = dataset.media.items[selectedVariation.slug]?.local;

  const resetFilters = () => {
    setActiveTier("all");
    setActiveQuality("all");
    setQuery("");
  };

  return (
    <div className={styles.catalogLayout}>
      <KnowledgeSearch items={searchItems} value={query} onChange={setQuery} />

      <nav className={styles.categoryNav} aria-label="Разделы базы предметов">
        {categories.map(({ id, label, icon: Icon }) => {
          const count = id === "artifacts" ? 1 : 0;
          return (
            <button
              type="button"
              className={`${styles.categoryButton} ${activeCategory === id ? styles.categoryButtonActive : ""}`}
              onClick={() => setActiveCategory(id)}
              aria-pressed={activeCategory === id}
              data-testid={`category-${id}`}
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          );
        })}
      </nav>

      <section className={styles.catalogSection}>
        <header className={styles.categoryHeader}>
          <div className={styles.categoryIdentity}><span><ActiveIcon size={22} /></span><div><h2>{activeCategoryData.label}</h2><p>{activeCategoryData.description}</p></div></div>
          <div className={styles.categoryCount}>{activeCategory === "artifacts" ? "1 предмет" : "Раздел пуст"}</div>
        </header>

        <div className={styles.filtersPanel}>
          <div className={styles.filterGroup}>
            <span>Тир</span>
            <div>
              <button type="button" className={activeTier === "all" ? styles.filterActive : ""} onClick={() => setActiveTier("all")}>Все</button>
              {tiers.map((tier) => <button type="button" className={activeTier === tier ? styles.filterActive : ""} onClick={() => setActiveTier(tier)} key={tier}>T{tier}</button>)}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span>Качество</span>
            <div>
              <button type="button" className={activeQuality === "all" ? styles.filterActive : ""} onClick={() => setActiveQuality("all")}>Все</button>
              {qualities.map((quality) => (
                <button type="button" className={`${activeQuality === quality ? styles.filterActive : ""} ${styles.qualityFilter}`} onClick={() => setActiveQuality(quality)} key={quality} data-testid={`filter-quality-${quality}`}>
                  <i className={styles[quality]} /> {formatQuality(quality)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={styles.resetFilters} onClick={resetFilters}><RotateCcw size={14} /> Сбросить</button>
        </div>

        <div className={styles.catalogResults}>
          {visible ? (
            <Link className={styles.catalogCard} href={`/items/${item.slug}`} data-testid="catalog-item-arcane-buster">
              <div className={styles.catalogImage}>
                {activeImage && <Image src={activeImage} alt={`${item.name} ${selectedVariation.quality}`} width={128} height={128} priority />}
                <span className={`${styles.qualityDot} ${styles[selectedVariation.quality]}`} />
              </div>
              <div className={styles.catalogBody}>
                <div className={styles.cardEyebrow}>Artifact · Tier {item.tier}</div>
                <h2>{item.name}</h2>
                <div className={styles.itemAvailability}>
                  {variations.map((variation) => <span className={styles[variation.quality]} key={variation.quality}>{formatQuality(variation.quality)}</span>)}
                </div>
                <div className={styles.compactStats}>
                  {item.stats.map((stat) => {
                    const asset = dataset.media.stats[stat.type];
                    return <span key={stat.type}>{asset && <Image src={asset.local} alt="" width={18} height={18} />}[{stat.min}–{stat.max}] {asset?.label ?? stat.type}</span>;
                  })}
                </div>
                <div className={styles.openCard}>Открыть полную карточку <ArrowRight size={16} /></div>
              </div>
            </Link>
          ) : (
            <div className={styles.categoryEmpty}>
              <span><ActiveIcon size={25} /></span>
              <strong>{activeCategory === "artifacts" ? "Нет предметов с выбранными фильтрами" : "Предметы этого раздела ещё не импортированы"}</strong>
              <p>{activeCategory === "artifacts" ? "Измените тир, качество или поисковый запрос." : "Раздел уже готов и заполнится при следующем этапе парсинга."}</p>
              {(activeTier !== "all" || activeQuality !== "all" || query) && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
