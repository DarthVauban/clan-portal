import "server-only";
import { getDatabasePool } from "@/lib/database";
import type {
  CatalogItem,
  CorepunkCatalogDataset,
  CorepunkItem,
  CorepunkItemDataset,
  ItemDatabaseCounts,
  ItemRecipe,
  ItemRelationTarget,
  ItemSecondaryStat,
  ItemStat,
  MediaAsset,
} from "@/lib/corepunk-item-data";

type ItemRow = {
  slug: string;
  source_id: string;
  source_order: number;
  is_base: boolean;
  base_slug: string | null;
  name_en: string;
  name_ru: string;
  description_en: string;
  description_ru: string;
  description_effect_en: string;
  description_effect_ru: string;
  raw_data: CorepunkItem;
};

type ChildRow = { item_slug: string; position: number; source_id: string };
type IngredientRow = ChildRow & { ingredient_slug: string; ingredient_type: string; quantity: number };
type RecipeRow = { item_slug: string; position: number; recipe_id: string; name_ru: string };
type RecipeIngredientRow = IngredientRow & { recipe_id: string };
type StatRow = ChildRow & { stat_type: string; min_value: string; max_value: string };
type SecondaryStatRow = ChildRow & { stat_type: string; min_value: string | null; max_value: string | null; label_ru: string };
type ModificationRow = ChildRow & { modification_type: string; effect_ru: string };
type TagRow = ChildRow & { tag_name: string };
type SpecialEffectRow = { item_slug: string; source_id: string; title_ru: string; description_effect_ru: string };
type PriceRow = { item_slug: string; source_id: string; price_type: string; amount: string };
type MediaRow = { asset_category: "item" | "stat" | "profession"; asset_key: string; remote_url: string; local_path: string; downloaded: boolean; cached: boolean; label_ru: string | null; asset_type: string | null };
type RelationTargetRow = { requested_slug: string; requested_type: string; target_slug: string | null; route_slug: string | null; href: string | null; preview_slug: string | null; resolved: boolean };

type LoadedDatabase = {
  schemaVersion: number;
  source: Record<string, unknown>;
  counts: ItemDatabaseCounts;
  itemsBySlug: Map<string, CorepunkItem>;
  baseSlugs: string[];
  baseSlugSet: Set<string>;
  media: CorepunkItemDataset["media"];
  relationTargets: Record<string, ItemRelationTarget>;
};

let databasePromise: Promise<LoadedDatabase> | null = null;

function numericId(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mediaAsset(row: MediaRow): MediaAsset {
  return {
    remote: row.remote_url,
    local: row.local_path,
    downloaded: row.downloaded,
    cached: row.cached,
    label: row.label_ru ?? undefined,
    assetType: row.asset_type ?? undefined,
  };
}

async function loadDatabase(): Promise<LoadedDatabase> {
  const pool = getDatabasePool();
  const [datasetResult, itemResult, ingredientResult, recipeResult, recipeIngredientResult, statResult, secondaryStatResult, modificationResult, tagResult, specialEffectResult, priceResult, mediaResult, relationTargetResult] = await Promise.all([
    pool.query<{ schema_version: number; source: Record<string, unknown>; counts: ItemDatabaseCounts }>("SELECT schema_version, source, counts FROM corepunk_datasets WHERE dataset_key = 'corepunk-items'"),
    pool.query<ItemRow>("SELECT slug, source_id, source_order, is_base, base_slug, name_en, name_ru, description_en, description_ru, description_effect_en, description_effect_ru, raw_data FROM corepunk_items ORDER BY source_order"),
    pool.query<IngredientRow>("SELECT item_slug, position, source_id, ingredient_slug, ingredient_type, quantity FROM corepunk_item_ingredients ORDER BY item_slug, position"),
    pool.query<RecipeRow>("SELECT item_slug, position, recipe_id, name_ru FROM corepunk_item_recipes ORDER BY item_slug, position"),
    pool.query<RecipeIngredientRow>("SELECT item_slug, recipe_id, position, source_id, ingredient_slug, ingredient_type, quantity FROM corepunk_recipe_ingredients ORDER BY item_slug, recipe_id, position"),
    pool.query<StatRow>("SELECT item_slug, position, source_id, stat_type, min_value, max_value FROM corepunk_item_stats ORDER BY item_slug, position"),
    pool.query<SecondaryStatRow>("SELECT item_slug, position, source_id, stat_type, min_value, max_value, label_ru FROM corepunk_item_secondary_stats ORDER BY item_slug, position"),
    pool.query<ModificationRow>("SELECT item_slug, position, source_id, modification_type, effect_ru FROM corepunk_item_modifications ORDER BY item_slug, position"),
    pool.query<TagRow>("SELECT item_slug, position, source_id, tag_name FROM corepunk_item_tags ORDER BY item_slug, position"),
    pool.query<SpecialEffectRow>("SELECT item_slug, source_id, title_ru, description_effect_ru FROM corepunk_item_special_effects"),
    pool.query<PriceRow>("SELECT item_slug, source_id, price_type, amount FROM corepunk_item_prices"),
    pool.query<MediaRow>("SELECT asset_category, asset_key, remote_url, local_path, downloaded, cached, label_ru, asset_type FROM corepunk_media_assets"),
    pool.query<RelationTargetRow>("SELECT requested_slug, requested_type, target_slug, route_slug, href, preview_slug, resolved FROM corepunk_relation_targets"),
  ]);
  const dataset = datasetResult.rows[0];
  if (!dataset) throw new Error("Corepunk item dataset has not been imported.");

  const itemsBySlug = new Map<string, CorepunkItem>();
  for (const row of itemResult.rows) {
    itemsBySlug.set(row.slug, {
      ...row.raw_data,
      slug: row.slug,
      name: row.name_ru,
      englishName: row.name_en,
      description: row.description_ru,
      descriptionEffect: row.description_effect_ru,
      baseSlug: row.base_slug ?? undefined,
      ingredients: [],
      recipes: [],
      stats: [],
      secondaryStats: [],
      modifications: [],
      tags: [],
      specialEffect: null,
      price: null,
    });
  }

  for (const row of ingredientResult.rows) {
    const item = itemsBySlug.get(row.item_slug);
    item?.ingredients.push({ id: numericId(row.source_id), name: row.ingredient_slug, type: row.ingredient_type, quantity: row.quantity });
  }
  const recipesByKey = new Map<string, ItemRecipe>();
  for (const row of recipeResult.rows) {
    const item = itemsBySlug.get(row.item_slug);
    if (!item) continue;
    const recipe: ItemRecipe = { id: numericId(row.recipe_id), name: row.name_ru, ingredients: [] };
    item.recipes.push(recipe);
    recipesByKey.set(`${row.item_slug}:${row.recipe_id}`, recipe);
  }
  for (const row of recipeIngredientResult.rows) {
    recipesByKey.get(`${row.item_slug}:${row.recipe_id}`)?.ingredients.push({ id: numericId(row.source_id), name: row.ingredient_slug, type: row.ingredient_type, quantity: row.quantity });
  }
  for (const row of statResult.rows) {
    const stat: ItemStat = { id: numericId(row.source_id), type: row.stat_type, min: Number(row.min_value), max: Number(row.max_value) };
    itemsBySlug.get(row.item_slug)?.stats.push(stat);
  }
  for (const row of secondaryStatResult.rows) {
    const stat: ItemSecondaryStat = { id: row.source_id, type: "random", min: null, max: null, label: row.label_ru };
    itemsBySlug.get(row.item_slug)?.secondaryStats.push(stat);
  }
  for (const row of modificationResult.rows) {
    itemsBySlug.get(row.item_slug)?.modifications?.push({ id: numericId(row.source_id), type: row.modification_type, effect: row.effect_ru });
  }
  for (const row of tagResult.rows) {
    itemsBySlug.get(row.item_slug)?.tags?.push({ id: numericId(row.source_id), name: row.tag_name });
  }
  for (const row of specialEffectResult.rows) {
    const item = itemsBySlug.get(row.item_slug);
    if (item) item.specialEffect = { id: numericId(row.source_id), title: row.title_ru, descriptionEffect: row.description_effect_ru };
  }
  for (const row of priceResult.rows) {
    const item = itemsBySlug.get(row.item_slug);
    if (item) item.price = { id: numericId(row.source_id), type: row.price_type, amount: row.amount };
  }

  const media: CorepunkItemDataset["media"] = { items: {}, stats: {}, professions: {} };
  for (const row of mediaResult.rows) {
    const collection = row.asset_category === "item" ? media.items : row.asset_category === "stat" ? media.stats : media.professions;
    collection[row.asset_key] = mediaAsset(row);
  }
  const relationTargets = Object.fromEntries(relationTargetResult.rows.map((row) => [row.requested_slug, {
    requestedSlug: row.requested_slug,
    requestedType: row.requested_type,
    targetSlug: row.target_slug,
    routeSlug: row.route_slug,
    href: row.href,
    previewSlug: row.preview_slug,
    resolved: row.resolved,
  } satisfies ItemRelationTarget]));
  const baseSlugs = itemResult.rows.filter((row) => row.is_base).map((row) => row.slug);
  return { schemaVersion: dataset.schema_version, source: dataset.source, counts: dataset.counts, itemsBySlug, baseSlugs, baseSlugSet: new Set(baseSlugs), media, relationTargets };
}

function database() {
  databasePromise ??= loadDatabase();
  return databasePromise;
}

export async function getItemDatabaseCounts() {
  return (await database()).counts;
}

export async function getBaseItemSlugs() {
  return (await database()).baseSlugs;
}

export async function getAllItems() {
  return [...(await database()).itemsBySlug.values()];
}

export async function getItem(slug: string) {
  return (await database()).itemsBySlug.get(slug);
}

export async function getBaseItem(slug: string) {
  const loaded = await database();
  return loaded.baseSlugSet.has(slug) ? loaded.itemsBySlug.get(slug) : undefined;
}

export async function getItemImage(slug: string) {
  return (await database()).media.items[slug]?.local;
}

export async function getItemImageMap() {
  return Object.fromEntries(Object.entries((await database()).media.items).map(([slug, asset]) => [slug, asset.local]));
}

export async function getCatalogDataset(): Promise<CorepunkCatalogDataset> {
  const loaded = await database();
  const variationsByRoot = new Map<string, CorepunkItem[]>();
  for (const item of loaded.itemsBySlug.values()) {
    const rootSlug = item.baseSlug ?? item.slug;
    const variations = variationsByRoot.get(rootSlug) ?? [];
    variations.push(item);
    variationsByRoot.set(rootSlug, variations);
  }
  const items = loaded.baseSlugs.flatMap((slug): CatalogItem[] => {
    const item = loaded.itemsBySlug.get(slug);
    if (!item) return [];
    return [{
      name: item.name,
      englishName: item.englishName ?? item.name,
      slug: item.slug,
      type: item.type,
      profession: item.profession,
      mastery: item.mastery ?? null,
      quality: item.quality,
      tier: item.tier,
      level: item.level,
      upgradable: item.upgradable,
      description: item.description,
      descriptionEffect: item.descriptionEffect,
      stats: item.stats,
      variations: (variationsByRoot.get(slug) ?? [item]).map((variation) => ({ slug: variation.slug, quality: variation.quality, image: loaded.media.items[variation.slug]?.local })),
    }];
  });
  return { counts: loaded.counts, items, stats: loaded.media.stats };
}

export async function getKnowledgeSearchItems() {
  const dataset = await getCatalogDataset();
  const typeLabels: Record<string, string> = { weapon: "Оружие", implant: "Артефакт", chip: "Чип", rune: "Руна", consumable: "Расходный материал", resource: "Ресурс" };
  return dataset.items.map((item) => ({
    name: item.name,
    englishName: item.englishName,
    slug: item.slug,
    meta: `${typeLabels[item.type] ?? item.type} · Тир ${item.tier}`,
    image: item.variations[0]?.image,
    aliases: [item.name, item.englishName],
  }));
}

export async function getItemDetailDataset(slug: string): Promise<CorepunkItemDataset | undefined> {
  const loaded = await database();
  if (!loaded.baseSlugSet.has(slug)) return undefined;
  const root = loaded.itemsBySlug.get(slug);
  if (!root) return undefined;
  const requestedRelatedSlugs = new Set<string>();
  for (const ingredient of root.ingredients ?? []) requestedRelatedSlugs.add(ingredient.name);
  for (const recipe of root.recipes ?? []) for (const ingredient of recipe.ingredients ?? []) requestedRelatedSlugs.add(ingredient.name);
  const variations = [...loaded.itemsBySlug.values()].filter((item) => item.slug === root.slug || item.baseSlug === root.slug);
  const related = [...requestedRelatedSlugs].map((relatedSlug) => loaded.itemsBySlug.get(relatedSlug)).filter((item): item is CorepunkItem => Boolean(item));
  const records = [...new Map([...variations, ...related].map((item) => [item.slug, item])).values()];
  const itemMedia = Object.fromEntries(records.flatMap((item) => loaded.media.items[item.slug] ? [[item.slug, loaded.media.items[item.slug]]] : []));
  const relationTargets = Object.fromEntries([...requestedRelatedSlugs].flatMap((relatedSlug) => loaded.relationTargets[relatedSlug] ? [[relatedSlug, loaded.relationTargets[relatedSlug]]] : []));
  const sourcePage = String(loaded.source.page ?? "https://corepunk.help/items");
  const sourceApi = String(loaded.source.api ?? "");
  return {
    schemaVersion: loaded.schemaVersion,
    source: {
      page: `${sourcePage.split("?")[0]}/${root.type}/${root.slug}`,
      api: `${sourceApi.replace("/by-category", "")}/${root.slug}`,
      assetBase: String(loaded.source.assetBase ?? ""),
      scrapedAt: String(loaded.source.scrapedAt ?? ""),
      language: String(loaded.source.language ?? "en"),
    },
    rootSlug: root.slug,
    relatedSlugs: [...requestedRelatedSlugs],
    records,
    relations: { targets: relationTargets },
    media: { items: itemMedia, stats: loaded.media.stats, professions: loaded.media.professions },
  };
}
