import itemDatasetJson from "@/data/implant-arcane-buster-t3.json";

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
  ingredients: ItemIngredient[];
  stats: ItemStat[];
  secondaryStats: ItemSecondaryStat[];
  specialEffect: null | {
    id: number;
    title: string;
    descriptionEffect: string;
  };
  recipes: ItemRecipe[];
  price: null | { id: number; type: string; amount: string };
  baseSlug?: string;
  synthesizedQualityVariant?: boolean;
};

type MediaAsset = {
  remote: string;
  local: string;
  downloaded: boolean;
  label?: string;
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
  media: {
    items: Record<string, MediaAsset>;
    stats: Record<string, MediaAsset>;
    professions: Record<string, MediaAsset>;
  };
};

export const itemDataset = itemDatasetJson as CorepunkItemDataset;

export function getItem(slug: string) {
  return itemDataset.records.find((item) => item.slug === slug);
}

export function getRootItem() {
  const item = getItem(itemDataset.rootSlug);
  if (!item) throw new Error(`Root item not found: ${itemDataset.rootSlug}`);
  return item;
}

export function getItemImage(slug: string) {
  return itemDataset.media.items[slug]?.local;
}

export function formatQuality(quality: ItemQuality) {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

export function getDirectRecipeItems(root: CorepunkItem) {
  const slugs = new Set<string>();
  for (const ingredient of root.ingredients) slugs.add(ingredient.name);
  for (const recipe of root.recipes) {
    for (const ingredient of recipe.ingredients) slugs.add(ingredient.name);
  }
  return [...slugs].map(getItem).filter((item): item is CorepunkItem => Boolean(item));
}
