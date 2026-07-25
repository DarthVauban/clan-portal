import "server-only";

import itemDatasetJson from "@/data/corepunk-items.json";
import { corepunkClasses } from "@/lib/corepunk-classes";
import type { CorepunkItem, CorepunkItemDataset, MediaAsset } from "@/lib/corepunk-item-data";
import { localizeCorepunkItem, localizeStatAssets } from "@/lib/corepunk-localization";
import {
  getAllItems,
  getBaseItemSlugs,
  getCatalogDataset,
  getItemImageMap,
} from "@/lib/corepunk-item-repository";
import type {
  BuilderIngredient,
  BuilderQuality,
  BuilderRecipe,
  CharacterBuilderDataset,
} from "@/lib/character-builder";

const equipmentTypes = new Set(["weapon", "implant", "chip", "rune"]);
const qualityOrder: BuilderQuality[] = ["uncommon", "rare", "epic"];

type BuilderSource = {
  allItems: CorepunkItem[];
  baseSlugs: string[];
  imageMap: Record<string, string>;
  stats: Record<string, MediaAsset>;
};

async function loadBuilderSource(): Promise<BuilderSource> {
  try {
    const [allItems, baseSlugs, imageMap, catalog] = await Promise.all([
      getAllItems(),
      getBaseItemSlugs(),
      getItemImageMap(),
      getCatalogDataset(),
    ]);
    return { allItems, baseSlugs, imageMap, stats: catalog.stats };
  } catch {
    const dataset = itemDatasetJson as unknown as CorepunkItemDataset & { baseSlugs: string[] };
    const imageMap = Object.fromEntries(Object.entries(dataset.media.items).flatMap(([slug, asset]) => (
      asset.downloaded && asset.local ? [[slug, asset.local]] : []
    )));
    return {
      allItems: dataset.records.map(localizeCorepunkItem),
      baseSlugs: dataset.baseSlugs,
      imageMap,
      stats: localizeStatAssets(dataset.media.stats),
    };
  }
}

function mapIngredients(ingredients: Array<{ name: string; quantity: number; type: string }>): BuilderIngredient[] {
  return ingredients.map((ingredient) => ({
    slug: ingredient.name,
    quantity: ingredient.quantity,
    type: ingredient.type,
  }));
}

function mapRecipes(item: {
  ingredients?: Array<{ name: string; quantity: number; type: string }>;
  recipes?: Array<{ name: string; ingredients: Array<{ name: string; quantity: number; type: string }> }>;
}): BuilderRecipe[] {
  const upgraded = item.recipes?.find((recipe) => /upgraded|улучш|покращ/i.test(recipe.name))
    ?? item.recipes?.[0];
  const overclocked = item.recipes?.find((recipe) => /overclocked|разогн|розігн/i.test(recipe.name))
    ?? item.recipes?.[1];
  return [
    { id: "regular", label: "Обычный", ingredients: mapIngredients(item.ingredients ?? []) },
    { id: "upgraded", label: "Улучшенный", ingredients: mapIngredients(upgraded?.ingredients ?? item.ingredients ?? []) },
    { id: "overclocked", label: "Разогнанный", ingredients: mapIngredients(overclocked?.ingredients ?? upgraded?.ingredients ?? item.ingredients ?? []) },
  ];
}

export async function getCharacterBuilderDataset(): Promise<CharacterBuilderDataset> {
  const { allItems, baseSlugs, imageMap, stats } = await loadBuilderSource();
  const itemsBySlug = new Map(allItems.map((item) => [item.slug, item]));
  const variationsByRoot = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const rootSlug = item.baseSlug ?? item.slug;
    variationsByRoot.set(rootSlug, [...(variationsByRoot.get(rootSlug) ?? []), item]);
  }

  const equipment = baseSlugs.flatMap((slug) => {
    const item = itemsBySlug.get(slug);
    if (!item || !equipmentTypes.has(item.type) || item.tier < 1 || item.tier > 3) return [];
    const variations = qualityOrder.flatMap((quality) => {
      const variation = (variationsByRoot.get(slug) ?? []).find((candidate) => candidate.quality === quality);
      if (!variation) return [];
      return [{
        slug: variation.slug,
        quality,
        image: imageMap[variation.slug] ?? imageMap[slug] ?? null,
        stats: variation.stats.map((stat) => ({ type: stat.type, min: stat.min, max: stat.max })),
      }];
    });
    if (variations.length === 0) {
      variations.push({
        slug: item.slug,
        quality: "uncommon",
        image: imageMap[item.slug] ?? null,
        stats: item.stats.map((stat) => ({ type: stat.type, min: stat.min, max: stat.max })),
      });
    }
    return [{
      slug: item.slug,
      name: item.name,
      englishName: item.englishName ?? item.name,
      type: item.type as "weapon" | "implant" | "chip" | "rune",
      slot: item.slot,
      mastery: item.mastery ?? null,
      tier: item.tier,
      profession: item.profession,
      description: item.description,
      descriptionEffect: item.descriptionEffect,
      variations,
      recipes: mapRecipes(item),
    }];
  });

  return {
    classes: corepunkClasses
      .filter((heroClass) => heroClass.available)
      .map(({ slug, name, family, image }) => ({ slug, name, family, image })),
    equipment,
    references: allItems.map((item) => ({
      slug: item.slug,
      name: item.name,
      englishName: item.englishName ?? item.name,
      type: item.type,
      tier: item.tier,
      quality: item.quality,
      baseSlug: item.baseSlug ?? null,
      image: imageMap[item.slug] ?? null,
      ingredients: mapIngredients(item.ingredients ?? []),
      recipes: mapRecipes(item),
    })),
    stats: Object.fromEntries(Object.entries(stats).map(([type, asset]) => [
      type,
      {
        label: asset.label ?? type.toUpperCase(),
        image: asset.downloaded ? asset.local : null,
      },
    ])),
  };
}
