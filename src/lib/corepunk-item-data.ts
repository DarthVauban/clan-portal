import itemDatabaseJson from "@/data/corepunk-items.json";
import { localizeCorepunkItem, localizeStatAssets } from "@/lib/corepunk-localization";

export type ItemQuality = "common" | "uncommon" | "rare" | "epic" | string;

export type ItemIngredient = {
  id: number;
  quantity: number;
  name: string;
  type: string;
};

export type ItemStat = {
  id: number;
  type: string;
  min: number;
  max: number;
};

export type ItemSecondaryStat = {
  id: string;
  type: "random";
  min: null;
  max: null;
  label: string;
};

export type ItemRecipe = {
  id: number;
  name: string;
  ingredients: ItemIngredient[];
};

export type CorepunkItem = {
  id: number | string;
  documentId: string;
  name: string;
  englishName?: string;
  slug: string;
  quality: ItemQuality;
  type: string;
  assetType?: string;
  profession: string | null;
  professionLevel: string | null;
  level: number;
  descriptionEffect: string;
  tier: number;
  upgradable: boolean;
  description: string;
  slot: string | null;
  mastery?: string | null;
  ingredients: ItemIngredient[];
  stats: ItemStat[];
  secondaryStats: ItemSecondaryStat[];
  modifications?: Array<{ id: number; effect: string; type: string }>;
  tags?: Array<{ id: number; name: string }>;
  specialEffect: null | {
    id: number;
    title: string;
    descriptionEffect: string;
  };
  recipes: ItemRecipe[];
  price: null | { id: number; type: string; amount: string };
  scale?: unknown;
  scales?: unknown[];
  requirements?: unknown;
  baseSlug?: string;
  synthesizedQualityVariant?: boolean;
};

export type MediaAsset = {
  remote: string;
  local: string;
  downloaded: boolean;
  cached?: boolean;
  label?: string;
  assetType?: string;
};

export type ItemRelationTarget = {
  requestedSlug: string;
  requestedType: string;
  targetSlug: string | null;
  routeSlug: string | null;
  href: string | null;
  previewSlug: string | null;
  resolved: boolean;
};

export type CorepunkItemDataset = {
  schemaVersion: number;
  source: {
    page: string;
    api: string;
    assetBase: string;
    scrapedAt: string;
    language: string;
  };
  rootSlug: string;
  relatedSlugs: string[];
  records: CorepunkItem[];
  relations: {
    targets: Record<string, ItemRelationTarget>;
  };
  media: {
    items: Record<string, MediaAsset>;
    stats: Record<string, MediaAsset>;
    professions: Record<string, MediaAsset>;
  };
};

type FullItemDatabase = {
  schemaVersion: number;
  source: {
    page: string;
    api: string;
    assetBase: string;
    scrapedAt: string;
    language: string;
    allowedTypes: string[];
  };
  counts: {
    sourceRows: number;
    uniqueBaseItems: number;
    duplicateRows: number;
    synthesizedQualityVariants: number;
    totalRecords: number;
    itemIcons: number;
    statIcons: number;
    professions: number;
    relationEdges: number;
    unresolvedRelationTargets: number;
    byType: Record<string, number>;
  };
  baseSlugs: string[];
  records: CorepunkItem[];
  relations: {
    targets: Record<string, ItemRelationTarget>;
    edges: Array<ItemRelationTarget & {
      sourceSlug: string;
      sourceType: string;
      kind: string;
      quantity: number;
      recipeId: number | null;
      recipeName: string | null;
    }>;
  };
  media: CorepunkItemDataset["media"];
};

export type CatalogVariation = {
  slug: string;
  quality: ItemQuality;
  image?: string;
};

export type CatalogItem = {
  name: string;
  englishName: string;
  slug: string;
  type: string;
  profession: string | null;
  mastery: string | null;
  quality: ItemQuality;
  tier: number;
  level: number;
  upgradable: boolean;
  description: string;
  descriptionEffect: string;
  stats: ItemStat[];
  variations: CatalogVariation[];
};

export type CorepunkCatalogDataset = {
  counts: FullItemDatabase["counts"];
  items: CatalogItem[];
  stats: Record<string, MediaAsset>;
};

const itemDatabase = itemDatabaseJson as FullItemDatabase;
const recordsBySlug = new Map(itemDatabase.records.map((item) => [item.slug, localizeCorepunkItem(item)]));
const baseSlugSet = new Set(itemDatabase.baseSlugs);
const localizedStats = localizeStatAssets(itemDatabase.media.stats);
const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакт",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходный материал",
  resource: "Ресурс",
};

function itemVariations(slug: string) {
  return itemDatabase.records
    .filter((item) => item.slug === slug || item.baseSlug === slug)
    .map((item) => recordsBySlug.get(item.slug))
    .filter((item): item is CorepunkItem => Boolean(item));
}

export const catalogDataset: CorepunkCatalogDataset = {
  counts: itemDatabase.counts,
  items: itemDatabase.baseSlugs.flatMap((slug) => {
    const item = recordsBySlug.get(slug);
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
      variations: itemVariations(item.slug).map((variation) => ({
        slug: variation.slug,
        quality: variation.quality,
        image: itemDatabase.media.items[variation.slug]?.local,
      })),
    }];
  }),
  stats: localizedStats,
};

export const baseItemSlugs = itemDatabase.baseSlugs;
export const itemDatabaseCounts = itemDatabase.counts;
export const knowledgeSearchItems = catalogDataset.items.map((item) => ({
  name: item.name,
  englishName: item.englishName,
  slug: item.slug,
  meta: `${typeLabels[item.type] ?? item.type} · Тир ${item.tier}`,
  image: item.variations[0]?.image,
  aliases: [item.name, item.englishName],
}));

export function getItem(slug: string) {
  return recordsBySlug.get(slug);
}

export function getBaseItem(slug: string) {
  if (!baseSlugSet.has(slug)) return undefined;
  return getItem(slug);
}

export function getItemImage(slug: string) {
  return itemDatabase.media.items[slug]?.local;
}

export function getItemDetailDataset(slug: string): CorepunkItemDataset | undefined {
  const root = getBaseItem(slug);
  if (!root) return undefined;

  const requestedRelatedSlugs = new Set<string>();
  for (const ingredient of root.ingredients ?? []) requestedRelatedSlugs.add(ingredient.name);
  for (const recipe of root.recipes ?? []) {
    for (const ingredient of recipe.ingredients ?? []) requestedRelatedSlugs.add(ingredient.name);
  }

  const variations = itemVariations(root.slug);
  const related = [...requestedRelatedSlugs]
    .map((relatedSlug) => recordsBySlug.get(relatedSlug))
    .filter((item): item is CorepunkItem => Boolean(item));
  const records = [...new Map([...variations, ...related].map((item) => [item.slug, item])).values()];
  const mediaSlugs = new Set(records.map((item) => item.slug));
  const itemMedia = Object.fromEntries(
    [...mediaSlugs]
      .map((mediaSlug) => [mediaSlug, itemDatabase.media.items[mediaSlug]] as const)
      .filter((entry): entry is readonly [string, MediaAsset] => Boolean(entry[1])),
  );
  const relationTargets = Object.fromEntries(
    [...requestedRelatedSlugs]
      .map((relatedSlug) => [relatedSlug, itemDatabase.relations.targets[relatedSlug]] as const)
      .filter((entry): entry is readonly [string, ItemRelationTarget] => Boolean(entry[1])),
  );

  return {
    schemaVersion: itemDatabase.schemaVersion,
    source: {
      page: `${itemDatabase.source.page.split("?")[0]}/${root.type}/${root.slug}`,
      api: `${itemDatabase.source.api.replace("/by-category", "")}/${root.slug}`,
      assetBase: itemDatabase.source.assetBase,
      scrapedAt: itemDatabase.source.scrapedAt,
      language: itemDatabase.source.language,
    },
    rootSlug: root.slug,
    relatedSlugs: [...requestedRelatedSlugs],
    records,
    relations: { targets: relationTargets },
    media: {
      items: itemMedia,
      stats: localizedStats,
      professions: itemDatabase.media.professions,
    },
  };
}

export function formatQuality(quality: ItemQuality) {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

export function getDirectRecipeItems(root: CorepunkItem, dataset: CorepunkItemDataset) {
  const slugs = new Set<string>();
  for (const ingredient of root.ingredients ?? []) slugs.add(ingredient.name);
  for (const recipe of root.recipes ?? []) {
    for (const ingredient of recipe.ingredients ?? []) slugs.add(ingredient.name);
  }
  return [...slugs]
    .map((slug) => dataset.records.find((item) => item.slug === slug))
    .filter((item): item is CorepunkItem => Boolean(item));
}
