import type { CalculatorCraftItem, CalculatorIngredient, CalculatorReferenceItem } from "@/components/craft-calculator";
import { CraftRequestsManager } from "@/components/craft-requests-manager";
import { getAllItems, getBaseItemSlugs, getItemImageMap } from "@/lib/corepunk-item-repository";

export const dynamic = "force-dynamic";

const recipeNames: Record<string, string> = {
  Upgraded: "Улучшенный",
  Overclocked: "Разогнанный",
};

function mapIngredients(ingredients: Array<{ name: string; quantity: number; type: string }>): CalculatorIngredient[] {
  return ingredients.map((ingredient) => ({ slug: ingredient.name, quantity: ingredient.quantity, type: ingredient.type }));
}

export default async function CraftRequestsPage() {
  const [allItems, baseItemSlugs, imageMap] = await Promise.all([getAllItems(), getBaseItemSlugs(), getItemImageMap()]);
  const itemsBySlug = new Map(allItems.map((item) => [item.slug, item]));
  const variationsByRoot = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const rootSlug = item.baseSlug ?? item.slug;
    variationsByRoot.set(rootSlug, [...(variationsByRoot.get(rootSlug) ?? []), item]);
  }
  const referenceItems: CalculatorReferenceItem[] = allItems.map((item) => ({
    slug: item.slug,
    name: item.name,
    englishName: item.englishName ?? item.name,
    type: item.type,
    tier: item.tier,
    image: imageMap[item.slug] ?? null,
    ingredients: mapIngredients(item.ingredients ?? []),
  }));
  const craftItems: CalculatorCraftItem[] = baseItemSlugs.flatMap((slug) => {
    const item = itemsBySlug.get(slug);
    if (!item) return [];
    const recipes = [
      ...(item.ingredients?.length ? [{ id: `base-${item.slug}`, name: "Базовый", ingredients: mapIngredients(item.ingredients) }] : []),
      ...(item.recipes ?? []).map((recipe) => ({ id: `recipe-${recipe.id}`, name: recipeNames[recipe.name] ?? recipe.name, ingredients: mapIngredients(recipe.ingredients) })),
    ];
    if (recipes.length === 0) return [];
    return [{
      slug: item.slug,
      name: item.name,
      englishName: item.englishName ?? item.name,
      type: item.type,
      tier: item.tier,
      mastery: item.mastery ?? null,
      profession: item.profession ?? null,
      quality: item.quality,
      qualities: [...new Set((variationsByRoot.get(item.slug) ?? [item]).map((variation) => variation.quality))],
      image: imageMap[item.slug] ?? null,
      recipes,
    }];
  });

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Заявки · Крафт</div>
          <h1>Крафт предметов</h1>
          <p>Заявки связывают нужный предмет, рецепт, количество и материалы, чтобы крафтеры и лидеры видели очередь работ.</p>
        </div>
      </section>
      <CraftRequestsManager craftItems={craftItems} referenceItems={referenceItems} />
    </div>
  );
}
