"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Coins,
  FlaskConical,
  Hammer,
  Link2,
  PackageSearch,
  Sparkles,
} from "lucide-react";
import { KnowledgeSearch } from "@/components/knowledge-search";
import {
  type CorepunkItem,
  type CorepunkItemDataset,
  type ItemIngredient,
  formatQuality,
  getDirectRecipeItems,
} from "@/lib/corepunk-item-data";
import styles from "@/app/items/item-card.module.css";

const qualityOrder = ["common", "uncommon", "rare", "epic"];

function qualityClass(quality: string) {
  return styles[quality] ?? styles.common;
}

function RandomSecondaryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
      <path
        fill="currentColor"
        d="M14 20v-2h2.6l-3.175-3.175L14.85 13.4L18 16.55V14h2v6zm-8.6 0L4 18.6L16.6 6H14V4h6v6h-2V7.4zm3.775-9.425L4 5.4L5.4 4l5.175 5.175z"
      />
    </svg>
  );
}

function RichDescription({ text, dataset }: { text: string; dataset: CorepunkItemDataset }) {
  const lines = text.split(/<br\s*\/?>/gi);

  return (
    <div className={styles.effectDescription}>
      {lines.map((line, lineIndex) => (
        <p key={`${line}-${lineIndex}`}>
          {line.split(/(\[[a-z][a-z0-9_-]*\])/gi).map((part, partIndex) => {
            const tokenMatch = part.match(/^\[([a-z][a-z0-9_-]*)\]$/i);
            if (!tokenMatch) return <span key={partIndex}>{part}</span>;

            const token = tokenMatch[1].toLowerCase();
            const asset = dataset.media.stats[token];
            if (asset) {
              return (
                <span className={styles.inlineStat} key={`${token}-${partIndex}`}>
                  <Image src={asset.local} alt="" width={18} height={18} />
                  {asset.label}
                </span>
              );
            }

            if (token === "md") return <span className={styles.magicDamage} key={partIndex}>Magic Damage</span>;
            if (token === "pd") return <span className={styles.physicalDamage} key={partIndex}>Physical Damage</span>;
            return <span key={partIndex}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

function IngredientTile({
  ingredient,
  dataset,
}: {
  ingredient: ItemIngredient;
  dataset: CorepunkItemDataset;
}) {
  const item = dataset.records.find((record) => record.slug === ingredient.name);
  const media = dataset.media.items[ingredient.name];
  const quality = item?.quality ?? "common";

  return (
    <div className={styles.ingredientTile}>
      <div className={`${styles.ingredientImage} ${qualityClass(quality)}`}>
        {media && <Image src={media.local} alt={item?.name ?? ingredient.name} width={72} height={72} />}
        <span>{ingredient.quantity}</span>
      </div>
      <div>
        <strong>{item?.name ?? ingredient.name}</strong>
        <small>{item ? `${formatQuality(item.quality)} · ${item.type}` : ingredient.type}</small>
      </div>
    </div>
  );
}

function RecipeBlock({
  title,
  subtitle,
  ingredients,
  dataset,
  synthesis = false,
}: {
  title: string;
  subtitle: string;
  ingredients: ItemIngredient[];
  dataset: CorepunkItemDataset;
  synthesis?: boolean;
}) {
  return (
    <article className={styles.recipeBlock}>
      <div className={styles.recipeHeading}>
        <span>{synthesis ? <FlaskConical size={18} /> : <Hammer size={18} />}</span>
        <div><strong>{title}</strong><small>{subtitle}</small></div>
      </div>
      <div className={styles.ingredientGrid}>
        {ingredients.map((ingredient) => (
          <IngredientTile key={ingredient.id} ingredient={ingredient} dataset={dataset} />
        ))}
      </div>
    </article>
  );
}

export function CorepunkItemDetail({ dataset }: { dataset: CorepunkItemDataset }) {
  const item = dataset.records.find((record) => record.slug === dataset.rootSlug) as CorepunkItem;
  const variations = dataset.records
    .filter((record) => record.slug === item.slug || record.baseSlug === item.slug)
    .sort((a, b) => qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality));
  const [selectedSlug, setSelectedSlug] = useState(item.slug);
  const selectedItem = variations.find((variation) => variation.slug === selectedSlug) ?? item;
  const mainImage = dataset.media.items[selectedItem.slug];
  const relatedItems = getDirectRecipeItems(item);
  const professionAsset = selectedItem.profession ? dataset.media.professions[selectedItem.profession] : undefined;
  const searchItems = [{
    name: item.name,
    slug: item.slug,
    meta: `Артефакт · Tier ${item.tier}`,
    image: dataset.media.items[item.slug]?.local,
  }];

  return (
    <div className={styles.detailPage}>
      <div className={styles.detailTopbar}>
        <Link href="/items"><ArrowLeft size={16} /> База предметов</Link>
        <div><span className={styles.testBadge}>Тестовый импорт</span><span>Данные без перевода</span></div>
      </div>

      <KnowledgeSearch items={searchItems} compact />

      <section className={styles.itemHero}>
        <div className={`${styles.heroItemImage} ${qualityClass(selectedItem.quality)}`}>
          {mainImage && <Image key={selectedItem.slug} src={mainImage.local} alt={`${item.name} ${selectedItem.quality}`} width={196} height={196} priority />}
          <span className={styles.tierMark}>T{selectedItem.tier}</span>
        </div>

        <div className={styles.itemIdentity}>
          <div className={styles.itemType}>{item.type} · artifact slot</div>
          <h1>{item.name}</h1>
          <div className={styles.itemTags}>
            <span className={qualityClass(selectedItem.quality)}>{formatQuality(selectedItem.quality)}</span>
            <span>Tier {selectedItem.tier}</span>
            <span>Level {selectedItem.level}</span>
            <span>Upgradable</span>
          </div>
          <div className={styles.variationLabel}>Quality variations</div>
          <div className={styles.variationRow}>
            {variations.map((variation) => {
              const media = dataset.media.items[variation.slug];
              const active = variation.slug === selectedItem.slug;
              return (
                <button
                  type="button"
                  className={`${styles.variationTile} ${qualityClass(variation.quality)} ${active ? styles.variationTileActive : ""}`}
                  key={variation.slug}
                  onClick={() => setSelectedSlug(variation.slug)}
                  aria-pressed={active}
                  aria-label={`Выбрать качество ${formatQuality(variation.quality)}`}
                  data-testid={`quality-${variation.quality}`}
                >
                  {media && <Image src={media.local} alt={`${item.name} ${variation.quality}`} width={66} height={66} />}
                  <small>{formatQuality(variation.quality)}</small>
                </button>
              );
            })}
          </div>
        </div>

        <aside className={styles.itemFacts}>
          <div><span>Type</span><strong>{selectedItem.type}</strong></div>
          <div><span>Tier</span><strong>{selectedItem.tier}</strong></div>
          <div><span>Level</span><strong>{selectedItem.level}</strong></div>
          <div><span>Slot</span><strong>{selectedItem.slot ?? "—"}</strong></div>
          <div><span>Price</span><strong><Coins size={14} /> {selectedItem.price?.amount ?? "—"} {selectedItem.price?.type ?? ""}</strong></div>
        </aside>
      </section>

      <div className={styles.detailColumns}>
        <div className={styles.detailMain}>
          <section className={styles.detailSection}>
            <div className={styles.sectionTitle}><span>Main stats</span><small>{selectedItem.stats.length} characteristics</small></div>
            <div className={styles.statsPanel}>
              {selectedItem.stats.map((stat) => {
                const asset = dataset.media.stats[stat.type];
                return (
                  <div className={styles.statRow} key={stat.type}>
                    <span>{asset && <Image src={asset.local} alt="" width={25} height={25} />}</span>
                    <strong>[{stat.min} – {stat.max}] {asset?.label ?? stat.type}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          {selectedItem.secondaryStats.length > 0 && (
            <section className={styles.detailSection} data-testid="secondary-stats">
              <div className={styles.sectionTitle}>
                <span>Secondary stats</span>
                <small>{selectedItem.secondaryStats.length} random {selectedItem.secondaryStats.length === 1 ? "slot" : "slots"}</small>
              </div>
              <div className={styles.secondaryStatsPanel}>
                {selectedItem.secondaryStats.map((stat) => (
                  <div className={styles.secondaryStatRow} key={stat.id}>
                    <span><RandomSecondaryIcon /></span>
                    <strong>[?? – ??] {stat.label}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedItem.specialEffect && (
            <section className={styles.detailSection}>
              <div className={styles.sectionTitle}><span>Passive bonus</span><Sparkles size={17} /></div>
              <div className={styles.effectCard}>
                <h2>{selectedItem.specialEffect.title}</h2>
                <RichDescription text={selectedItem.specialEffect.descriptionEffect} dataset={dataset} />
              </div>
            </section>
          )}

          <section className={styles.detailSection}>
            <div className={styles.sectionTitle}><span>Modifications</span><small>Quality progression</small></div>
            <div className={styles.modifications}>
              <div><span>Upgraded</span><p>1 additional talent improvement.</p></div>
              <div><span>Overclocked</span><p>2 additional talents improvement.</p></div>
            </div>
          </section>
        </div>

        <aside className={styles.professionCard}>
          <div className={styles.sectionTitle}><span>Profession</span></div>
          <div className={styles.professionIdentity}>
            {professionAsset && <Image src={professionAsset.local} alt="" width={58} height={58} />}
            <div><small>Specialization</small><strong>{selectedItem.profession}</strong></div>
          </div>
          <div className={styles.proficiency}><span>Proficiency</span><strong>{selectedItem.professionLevel}</strong></div>
          <div className={styles.dataCoverage}>
            <PackageSearch size={17} />
            <div><strong>{dataset.records.length} records</strong><span>{relatedItems.length} direct recipe items + 3 quality variations</span></div>
          </div>
        </aside>
      </div>

      <section className={styles.craftingSection}>
        <div className={styles.craftingHeader}>
          <div><span className="surface-kicker">Crafting</span><h2>Recipes and ingredients</h2></div>
          <span>{item.ingredients.length + item.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)} ingredient positions</span>
        </div>
        <div className={styles.recipeStack}>
          <RecipeBlock title="Workbench recipe" subtitle="Base quality" ingredients={item.ingredients} dataset={dataset} />
          {item.recipes.map((recipe) => (
            <RecipeBlock key={recipe.id} title={recipe.name} subtitle="Synthesis machine" ingredients={recipe.ingredients} dataset={dataset} synthesis />
          ))}
        </div>
      </section>

      <section className={styles.relatedSection}>
        <div className={styles.craftingHeader}>
          <div><span className="surface-kicker">Relations</span><h2>Directly related items</h2></div>
          <span><Link2 size={14} /> {relatedItems.length} unique items</span>
        </div>
        <div className={styles.relatedGrid}>
          {relatedItems.map((related) => {
            const media = dataset.media.items[related.slug];
            return (
              <article className={styles.relatedCard} key={related.slug}>
                <div className={`${styles.relatedImage} ${qualityClass(related.quality)}`}>
                  {media && <Image src={media.local} alt={related.name} width={76} height={76} />}
                </div>
                <div><strong>{related.name}</strong><small>{formatQuality(related.quality)} · {related.type}</small></div>
              </article>
            );
          })}
        </div>
      </section>

    </div>
  );
}
