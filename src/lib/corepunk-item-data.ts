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
  specialEffect: null | { id: number; title: string; descriptionEffect: string };
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
  source: { page: string; api: string; assetBase: string; scrapedAt: string; language: string };
  rootSlug: string;
  relatedSlugs: string[];
  records: CorepunkItem[];
  relations: { targets: Record<string, ItemRelationTarget> };
  media: {
    items: Record<string, MediaAsset>;
    stats: Record<string, MediaAsset>;
    professions: Record<string, MediaAsset>;
  };
};

export type ItemDatabaseCounts = {
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

export type CatalogVariation = { slug: string; quality: ItemQuality; image?: string };

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
  counts: ItemDatabaseCounts;
  items: CatalogItem[];
  stats: Record<string, MediaAsset>;
};

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
