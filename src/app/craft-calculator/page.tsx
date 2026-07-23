import {
  CraftCalculator,
  type CalculatorCraftItem,
  type CalculatorIngredient,
  type CalculatorReferenceItem,
} from "@/components/craft-calculator";
import { getAllItems, getBaseItemSlugs, getItemImageMap } from "@/lib/corepunk-item-repository";

export const dynamic = "force-dynamic";

const recipeNames: Record<string, string> = {
  Upgraded: "Улучшенный",
  Overclocked: "Разогнанный",
};

function mapIngredients(ingredients: Array<{ name: string; quantity: number; type: string }>): CalculatorIngredient[] {
  return ingredients.map((ingredient) => ({ slug: ingredient.name, quantity: ingredient.quantity, type: ingredient.type }));
}

export default async function CraftCalculatorPage() {
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
          <div className="eyebrow">Инструменты · Планирование</div>
          <h1>Калькулятор крафта</h1>
          <p>Выберите предмет, вариант рецепта и количество. Калькулятор разложит крафт на итоговые материалы, а для управляющих ролей сопоставит результат с общим банком клана.</p>
        </div>
      </section>
      <CraftCalculator craftItems={craftItems} referenceItems={referenceItems} />
    </div>
  );
}
