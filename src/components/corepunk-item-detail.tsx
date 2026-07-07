"use client";

import { LoadableImage } from "@/components/loadable-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  Coins,
  FlaskConical,
  Hammer,
  Link2,
  PackageSearch,
  Sparkles,
} from "lucide-react";
import { KnowledgeSearch, type KnowledgeSearchItem } from "@/components/knowledge-search";
import { ItemNameLanguageToggle } from "@/components/item-name-language-toggle";
import {
  type CorepunkItem,
  type CorepunkItemDataset,
  type ItemIngredient,
  getDirectRecipeItems,
} from "@/lib/corepunk-item-data";
import { modificationLabel, priceTypeLabel, professionLabel, professionLevelLabel, slotLabel } from "@/lib/corepunk-localization";
import { useItemNameLanguage } from "@/lib/use-item-name-language";
import styles from "@/app/items/item-card.module.css";

const qualityOrder = ["common", "uncommon", "rare", "epic"];
const qualityLabels: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};
const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакт",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходный материал",
  resource: "Ресурс",
};
const CATALOG_RESTORE_KEY = "clan-portal:item-catalog-restore";

function qualityClass(quality: string) {
  return styles[quality] ?? styles.common;
}

function qualityLabel(quality: string) {
  return qualityLabels[quality] ?? quality;
}

function getStoredCatalogHref() {
  if (typeof window === "undefined") return "/items";
  const raw = sessionStorage.getItem(CATALOG_RESTORE_KEY);
  if (!raw) return "/items";
  try {
    const restore = JSON.parse(raw) as { href?: string; at?: number };
    if (restore.href?.startsWith("/items") && restore.at && Date.now() - restore.at < 30 * 60 * 1000) return restore.href;
  } catch {
    sessionStorage.removeItem(CATALOG_RESTORE_KEY);
  }
  return "/items";
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
            if (asset?.downloaded) {
              return (
                <span className={styles.inlineStat} key={`${token}-${partIndex}`}>
                  <LoadableImage src={asset.local} alt="" width={18} height={18} />
                  {asset.label}
                </span>
              );
            }

            if (token === "md") return <span className={styles.magicDamage} key={partIndex}>Магический урон</span>;
            if (token === "pd") return <span className={styles.physicalDamage} key={partIndex}>Физический урон</span>;
            return <span key={partIndex}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

function IngredientTile({ ingredient, dataset, showEnglishNames }: { ingredient: ItemIngredient; dataset: CorepunkItemDataset; showEnglishNames: boolean }) {
  const item = dataset.records.find((record) => record.slug === ingredient.name);
  const media = dataset.media.items[ingredient.name];
  const relation = dataset.relations.targets[ingredient.name];
  const quality = item?.quality ?? "common";
  const itemName = item ? (showEnglishNames ? item.englishName ?? item.name : item.name) : ingredient.name;
  const content = (
    <>
      <div className={`${styles.ingredientImage} ${qualityClass(quality)}`}>
        {media?.downloaded && <LoadableImage src={media.local} alt={itemName} width={72} height={72} />}
        <span>{ingredient.quantity}</span>
      </div>
      <div>
        <strong>{itemName}</strong>
        <small>{item ? `${qualityLabel(item.quality)} · ${typeLabels[item.type] ?? item.type}` : ingredient.type}</small>
      </div>
    </>
  );

  if (relation?.resolved && relation.href) {
    return (
      <Link
        href={relation.href}
        className={styles.ingredientTile}
        data-item-href={relation.href}
        data-target-slug={relation.routeSlug ?? undefined}
        data-hover-preview-slug={relation.previewSlug ?? undefined}
        data-relation-resolved="true"
        data-testid={`ingredient-link-${ingredient.name}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={styles.ingredientTile}
      data-item-href={relation?.href ?? undefined}
      data-target-slug={relation?.routeSlug ?? undefined}
      data-hover-preview-slug={relation?.previewSlug ?? undefined}
      data-relation-resolved={relation?.resolved ? "true" : "false"}
    >
      {content}
    </div>
  );
}

function RecipeBlock({
  title,
  subtitle,
  ingredients,
  dataset,
  synthesis = false,
  showEnglishNames,
}: {
  title: string;
  subtitle: string;
  ingredients: ItemIngredient[];
  dataset: CorepunkItemDataset;
  synthesis?: boolean;
  showEnglishNames: boolean;
}) {
  return (
    <article className={styles.recipeBlock}>
      <div className={styles.recipeHeading}>
        <span>{synthesis ? <FlaskConical size={18} /> : <Hammer size={18} />}</span>
        <div><strong>{title}</strong><small>{subtitle}</small></div>
      </div>
      <div className={styles.ingredientGrid}>
        {ingredients.map((ingredient) => <IngredientTile key={ingredient.id} ingredient={ingredient} dataset={dataset} showEnglishNames={showEnglishNames} />)}
      </div>
    </article>
  );
}

export function CorepunkItemDetail({
  dataset,
  searchItems,
}: {
  dataset: CorepunkItemDataset;
  searchItems: KnowledgeSearchItem[];
}) {
  const { showEnglishNames, setShowEnglishNames } = useItemNameLanguage();
  const router = useRouter();
  const item = dataset.records.find((record) => record.slug === dataset.rootSlug) as CorepunkItem;
  const variations = dataset.records
    .filter((record) => record.slug === item.slug || record.baseSlug === item.slug)
    .sort((a, b) => qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality));
  const [selectedSlug, setSelectedSlug] = useState(item.slug);
  const selectedItem = variations.find((variation) => variation.slug === selectedSlug) ?? item;
  const mainImage = dataset.media.items[selectedItem.slug];
  const relatedItems = getDirectRecipeItems(item, dataset);
  const professionAsset = selectedItem.profession ? dataset.media.professions[selectedItem.profession] : undefined;
  const ingredientPositions = item.ingredients.length + item.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
  const itemName = showEnglishNames ? item.englishName ?? item.name : item.name;
  const localizedSearchItems = searchItems.map((searchItem) => ({
    ...searchItem,
    name: showEnglishNames ? searchItem.englishName ?? searchItem.name : searchItem.name,
    aliases: [searchItem.name, searchItem.englishName, ...(searchItem.aliases ?? [])],
  }));
  const openCatalog = (event: MouseEvent<HTMLAnchorElement>) => {
    const href = getStoredCatalogHref();
    if (href === "/items") return;
    event.preventDefault();
    router.push(href);
  };

  return (
    <div className={styles.detailPage}>
      <div className={styles.detailTopbar}>
        <Link href="/items" onClick={openCatalog}><ArrowLeft size={16} /> База предметов</Link>
        <div><span className={styles.testBadge}>Полный импорт</span><span>Данные предметов без перевода</span></div>
      </div>

      <div className={styles.knowledgeTools}>
        <KnowledgeSearch items={localizedSearchItems} compact />
        <ItemNameLanguageToggle showEnglishNames={showEnglishNames} onChange={setShowEnglishNames} />
      </div>

      <section className={styles.itemHero}>
        <div className={`${styles.heroItemImage} ${qualityClass(selectedItem.quality)}`}>
          {mainImage?.downloaded && <LoadableImage key={selectedItem.slug} src={mainImage.local} alt={`${itemName} ${selectedItem.quality}`} width={196} height={196} priority />}
          <span className={styles.tierMark}>T{selectedItem.tier}</span>
        </div>

        <div className={styles.itemIdentity}>
          <div className={styles.itemType}>{typeLabels[item.type] ?? item.type}{item.slot ? ` · ${slotLabel(item.slot)}` : ""}</div>
          <h1>{itemName}</h1>
          <div className={styles.itemTags}>
            <span className={qualityClass(selectedItem.quality)}>{qualityLabel(selectedItem.quality)}</span>
            <span>Тир {selectedItem.tier}</span>
            <span>Уровень {selectedItem.level}</span>
            {selectedItem.upgradable && <span>Улучшаемый</span>}
          </div>
          {variations.length > 1 && (
            <>
              <div className={styles.variationLabel}>Варианты качества</div>
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
                      aria-label={`Выбрать качество: ${qualityLabel(variation.quality)}`}
                      data-testid={`quality-${variation.quality}`}
                    >
                      {media?.downloaded && <LoadableImage src={media.local} alt={`${itemName} ${variation.quality}`} width={66} height={66} />}
                      <small>{qualityLabel(variation.quality)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <aside className={styles.itemFacts}>
          <div><span>Тип</span><strong>{typeLabels[selectedItem.type] ?? selectedItem.type}</strong></div>
          <div><span>Тир</span><strong>{selectedItem.tier}</strong></div>
          <div><span>Уровень</span><strong>{selectedItem.level}</strong></div>
          <div><span>Слот</span><strong>{slotLabel(selectedItem.slot)}</strong></div>
          <div><span>Цена</span><strong><Coins size={14} /> {selectedItem.price?.amount ?? "—"} {priceTypeLabel(selectedItem.price?.type)}</strong></div>
        </aside>
      </section>

      <div className={styles.detailColumns}>
        <div className={styles.detailMain}>
          {(selectedItem.description || selectedItem.descriptionEffect) && (
            <section className={styles.detailSection}>
              <div className={styles.sectionTitle}><span>Описание</span></div>
              <div className={styles.effectCard}>
                {selectedItem.description && <p>{selectedItem.description}</p>}
                {selectedItem.descriptionEffect && <RichDescription text={selectedItem.descriptionEffect} dataset={dataset} />}
              </div>
            </section>
          )}

          {selectedItem.stats.length > 0 && (
            <section className={styles.detailSection}>
              <div className={styles.sectionTitle}><span>Основные характеристики</span><small>{selectedItem.stats.length}</small></div>
              <div className={styles.statsPanel}>
                {selectedItem.stats.map((stat) => {
                  const asset = dataset.media.stats[stat.type];
                  return (
                    <div className={styles.statRow} key={`${stat.type}-${stat.id}`}>
                      <span>{asset?.downloaded && <LoadableImage src={asset.local} alt="" width={25} height={25} />}</span>
                      <strong>[{stat.min} – {stat.max}] {asset?.label ?? stat.type}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {selectedItem.secondaryStats.length > 0 && (
            <section className={styles.detailSection} data-testid="secondary-stats">
              <div className={styles.sectionTitle}><span>Вторичные характеристики</span><small>{selectedItem.secondaryStats.length}</small></div>
              <div className={styles.secondaryStatsPanel}>
                {selectedItem.secondaryStats.map((stat) => (
                  <div className={styles.secondaryStatRow} key={stat.id}>
                    <span><RandomSecondaryIcon /></span>
                    <strong>[?? – ??] Случайная вторичная характеристика</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedItem.specialEffect && (
            <section className={styles.detailSection}>
              <div className={styles.sectionTitle}><span>Пассивный бонус</span><Sparkles size={17} /></div>
              <div className={styles.effectCard}>
                <h2>{selectedItem.specialEffect.title}</h2>
                <RichDescription text={selectedItem.specialEffect.descriptionEffect} dataset={dataset} />
              </div>
            </section>
          )}

          {selectedItem.modifications && selectedItem.modifications.length > 0 && (
            <section className={styles.detailSection}>
              <div className={styles.sectionTitle}><span>Модификации</span><small>Развитие предмета</small></div>
              <div className={styles.modifications}>
                {selectedItem.modifications.map((modification) => (
                  <div key={modification.id}><span>{modificationLabel(modification.type)}</span><RichDescription text={modification.effect} dataset={dataset} /></div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className={styles.professionCard}>
          <div className={styles.sectionTitle}><span>Профессия</span></div>
          <div className={styles.professionIdentity}>
            {professionAsset?.downloaded && <LoadableImage src={professionAsset.local} alt="" width={58} height={58} />}
            <div><small>Специализация</small><strong>{professionLabel(selectedItem.profession)}</strong></div>
          </div>
          <div className={styles.proficiency}><span>Уровень мастерства</span><strong>{professionLevelLabel(selectedItem.professionLevel)}</strong></div>
          <div className={styles.dataCoverage}>
            <PackageSearch size={17} />
            <div><strong>{dataset.records.length} связанных записей</strong><span>{relatedItems.length} прямых компонентов</span></div>
          </div>
        </aside>
      </div>

      {ingredientPositions > 0 && (
        <section className={styles.craftingSection}>
          <div className={styles.craftingHeader}>
            <div><span className="surface-kicker">Крафт</span><h2>Рецепты и компоненты</h2></div>
            <span>{ingredientPositions} позиций компонентов</span>
          </div>
          <div className={styles.recipeStack}>
            {item.ingredients.length > 0 && <RecipeBlock title="Рецепт верстака" subtitle="Базовое качество" ingredients={item.ingredients} dataset={dataset} showEnglishNames={showEnglishNames} />}
            {item.recipes.map((recipe) => (
              <RecipeBlock key={recipe.id} title={recipe.name} subtitle="Синтез-машина" ingredients={recipe.ingredients} dataset={dataset} synthesis showEnglishNames={showEnglishNames} />
            ))}
          </div>
        </section>
      )}

      {relatedItems.length > 0 && (
        <section className={styles.relatedSection}>
          <div className={styles.craftingHeader}>
            <div><span className="surface-kicker">Связи</span><h2>Связанные предметы</h2></div>
            <span><Link2 size={14} /> {relatedItems.length}</span>
          </div>
          <div className={styles.relatedGrid}>
            {relatedItems.map((related) => {
              const media = dataset.media.items[related.slug];
              const relation = dataset.relations.targets[related.slug];
              const href = relation?.href ?? `/items/${related.baseSlug ?? related.slug}`;
              const relatedName = showEnglishNames ? related.englishName ?? related.name : related.name;
              return (
                <Link
                  href={href}
                  className={styles.relatedCard}
                  key={related.slug}
                  data-item-href={href}
                  data-hover-preview-slug={relation?.previewSlug ?? undefined}
                  data-testid={`related-link-${related.slug}`}
                >
                  <div className={`${styles.relatedImage} ${qualityClass(related.quality)}`}>
                    {media?.downloaded && <LoadableImage src={media.local} alt={relatedName} width={76} height={76} />}
                  </div>
                  <div><strong>{relatedName}</strong><small>{qualityLabel(related.quality)} · {typeLabels[related.type] ?? related.type}</small></div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
