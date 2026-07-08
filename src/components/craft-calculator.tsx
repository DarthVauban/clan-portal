"use client";

import { LoadableImage } from "@/components/loadable-image";
import {
  AlertTriangle,
  Boxes,
  Calculator,
  CheckCircle2,
  Layers3,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { collectiveRoleLabels, findMembership, getPortalRole, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { hasPortalPermission } from "@/lib/portal-permissions";
import { LOCAL_PLAYER_ID } from "@/lib/profile-store";
import { useResourceStore } from "@/lib/resource-store";
import styles from "@/app/craft-calculator/craft-calculator.module.css";

export type CalculatorIngredient = {
  slug: string;
  quantity: number;
  type: string;
};

export type CalculatorRecipe = {
  id: string;
  name: string;
  ingredients: CalculatorIngredient[];
};

export type CalculatorCraftItem = {
  slug: string;
  name: string;
  englishName: string;
  type: string;
  tier: number;
  mastery: string | null;
  profession: string | null;
  quality: string;
  qualities: string[];
  image: string | null;
  recipes: CalculatorRecipe[];
};

export type CalculatorReferenceItem = {
  slug: string;
  name: string;
  englishName: string;
  type: string;
  tier: number;
  image: string | null;
  ingredients: CalculatorIngredient[];
};

type Requirement = CalculatorReferenceItem & {
  quantity: number;
};

const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакты",
  chip: "Чипы",
  rune: "Руны",
  consumable: "Расходники",
  resource: "Ресурсы",
};

const categoryOptions = ["all", "weapon", "implant", "chip", "rune", "consumable", "resource"] as const;
const tierOptions = [1, 2, 3] as const;
const numberFormatter = new Intl.NumberFormat("ru-RU");

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function fallbackName(slug: string) {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function CraftCalculator({ craftItems, referenceItems }: { craftItems: CalculatorCraftItem[]; referenceItems: CalculatorReferenceItem[] }) {
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState } = useResourceStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]>("all");
  const [tier, setTier] = useState<number | "all">("all");
  const [selectedItemSlug, setSelectedItemSlug] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const portalRole = getPortalRole(collectiveState, LOCAL_PLAYER_ID);
  const collectiveRole = membership?.member.role;
  const hasExtendedAccess = hasPortalPermission({
    portalRole,
    collectiveRole,
    accepted: Boolean(membership),
  }, "USE_CRAFT_CALCULATOR_EXTENDED");
  const accessRoleLabel = portalRole !== "member"
    ? portalRoleLabels[portalRole]
    : collectiveRole ? collectiveRoleLabels[collectiveRole] : "Участник";
  const referenceBySlug = useMemo(() => new Map(referenceItems.map((item) => [item.slug, item])), [referenceItems]);
  const selectedItem = craftItems.find((item) => item.slug === selectedItemSlug) ?? null;
  const selectedRecipe = selectedItem?.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? selectedItem?.recipes[0] ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const visibleItems = craftItems.filter((item) => (category === "all" || item.type === category)
    && (tier === "all" || item.tier === tier)
    && (!normalizedQuery || [item.name, item.englishName].some((name) => name.toLocaleLowerCase("ru").includes(normalizedQuery)))).slice(0, 80);

  const clanBalances = useMemo(() => {
    const total: Record<string, number> = {};
    for (const collective of collectiveState.collectives) {
      const balance = resourceState.balances[collective.id];
      if (!balance) continue;
      for (const [slug, amount] of Object.entries(balance.resources)) total[slug] = (total[slug] ?? 0) + amount;
    }
    return total;
  }, [collectiveState.collectives, resourceState.balances]);

  const resolveRequirement = (ingredient: CalculatorIngredient, multiplier: number): Requirement => {
    const reference = referenceBySlug.get(ingredient.slug);
    return {
      slug: ingredient.slug,
      name: reference?.name ?? fallbackName(ingredient.slug),
      englishName: reference?.englishName ?? fallbackName(ingredient.slug),
      type: reference?.type ?? ingredient.type,
      tier: reference?.tier ?? 0,
      image: reference?.image ?? null,
      ingredients: reference?.ingredients ?? [],
      quantity: ingredient.quantity * multiplier,
    };
  };

  const directRequirements = selectedRecipe
    ? selectedRecipe.ingredients.map((ingredient) => resolveRequirement(ingredient, quantity))
    : [];

  const flattenedPerCraft = (() => {
    if (!selectedRecipe) return [];
    const totals = new Map<string, Requirement>();
    const expand = (ingredients: CalculatorIngredient[], multiplier: number, path: Set<string>) => {
      for (const ingredient of ingredients) {
        const requirement = resolveRequirement(ingredient, multiplier);
        if (requirement.ingredients.length > 0 && !path.has(requirement.slug)) {
          const nextPath = new Set(path);
          nextPath.add(requirement.slug);
          expand(requirement.ingredients, requirement.quantity, nextPath);
        } else {
          const previous = totals.get(requirement.slug);
          totals.set(requirement.slug, { ...requirement, quantity: (previous?.quantity ?? 0) + requirement.quantity });
        }
      }
    };
    expand(selectedRecipe.ingredients, 1, new Set([selectedItemSlug]));
    return [...totals.values()].sort((first, second) => first.type === second.type
      ? second.quantity - first.quantity
      : first.type === "resource" ? -1 : 1);
  })();

  const finalRequirements = flattenedPerCraft.map((requirement) => ({ ...requirement, quantity: requirement.quantity * quantity }));
  const trackedResources = flattenedPerCraft.filter((requirement) => requirement.type === "resource");
  const bankCraftCapacity = trackedResources.length > 0
    ? Math.min(...trackedResources.map((requirement) => Math.floor((clanBalances[requirement.slug] ?? 0) / requirement.quantity)))
    : 0;
  const coveredCrafts = Math.min(quantity, bankCraftCapacity);
  const totalRequiredUnits = finalRequirements.reduce((total, requirement) => total + requirement.quantity, 0);
  const totalRequiredResourceUnits = finalRequirements.reduce((total, requirement) => requirement.type === "resource" ? total + requirement.quantity : total, 0);
  const totalCoveredUnits = finalRequirements.reduce((total, requirement) => requirement.type === "resource"
    ? total + Math.min(requirement.quantity, clanBalances[requirement.slug] ?? 0)
    : total, 0);

  const chooseItem = (item: CalculatorCraftItem) => {
    setSelectedItemSlug(item.slug);
    setSelectedRecipeId(item.recipes[0]?.id ?? "");
  };

  return (
    <div className={styles.calculatorLayout}>
      <section className={styles.accessBar}>
        <div className={styles.accessIdentity}>
          <span className={hasExtendedAccess ? styles.accessIconExtended : ""}>{hasExtendedAccess ? <ShieldCheck size={18} /> : <UserRound size={18} />}</span>
          <div><small>Режим калькулятора</small><strong>{hasExtendedAccess ? "Расширенный расчёт" : "Личный расчёт"}</strong><p>{hasExtendedAccess ? "Доступно сравнение с суммарным банком всех коллективов." : "Расчёт компонентов без доступа к балансам клана."}</p></div>
        </div>
        <div className={styles.accessRole}><span>Ваша роль</span><strong>{accessRoleLabel}</strong></div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.recipeSelector}>
          <header><span>Шаг 1</span><h2>Выберите предмет</h2><p>Доступны все предметы с рецептом из базы знаний.</p></header>
          <label className={styles.searchBox}><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию..." /></label>
          <div className={styles.filterBlock}>
            <span className={styles.filterLabel}>Тип предмета</span>
            <div className={styles.categoryFilters}>
              {categoryOptions.map((value) => <button type="button" className={category === value ? styles.filterActive : ""} onClick={() => setCategory(value)} key={value}>{value === "all" ? "Все" : typeLabels[value]}</button>)}
            </div>
          </div>
          <div className={styles.filterBlock}>
            <span className={styles.filterLabel}>Тир предмета</span>
            <div className={styles.categoryFilters}>
              <button type="button" className={tier === "all" ? styles.filterActive : ""} onClick={() => setTier("all")}>Все</button>
              {tierOptions.map((value) => <button type="button" className={tier === value ? styles.filterActive : ""} onClick={() => setTier(value)} key={value}>T{value}</button>)}
            </div>
          </div>
          <div className={styles.itemList} data-testid="craft-item-list">
            {visibleItems.map((item) => (
              <button type="button" className={selectedItemSlug === item.slug ? styles.itemActive : ""} onClick={() => chooseItem(item)} key={item.slug}>
                <span className={styles.itemIcon}>{item.image ? <LoadableImage src={item.image} alt="" width={48} height={48} /> : <Boxes size={20} />}</span>
                <div><strong>{item.name}</strong><small>{typeLabels[item.type] ?? item.type} · T{item.tier} · {item.recipes.length} {item.recipes.length === 1 ? "рецепт" : "рецепта"}</small></div>
              </button>
            ))}
            {visibleItems.length === 0 && <div className={styles.noItems}>По заданным фильтрам рецепты не найдены.</div>}
          </div>
          <footer>Показано: {visibleItems.length} из {craftItems.length}</footer>
        </section>

        <main className={styles.calculationPanel}>
          {!selectedItem || !selectedRecipe ? (
            <div className={styles.emptyCalculation}>
              <span><Calculator size={28} /></span><h2>Выберите рецепт для расчёта</h2><p>После выбора предмета здесь появятся варианты рецепта, количество и полный список компонентов.</p>
            </div>
          ) : (
            <>
              <section className={styles.selectedRecipe}>
                <div className={styles.selectedItem}>
                  <span>{selectedItem.image ? <LoadableImage src={selectedItem.image} alt="" width={76} height={76} /> : <Boxes size={28} />}</span>
                  <div><small>{typeLabels[selectedItem.type] ?? selectedItem.type} · Тир {selectedItem.tier}</small><h2>{selectedItem.name}</h2><p>{selectedItem.englishName}</p></div>
                </div>
                <div className={styles.quantityControl}>
                  <span>Желаемое количество</span>
                  <div><button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity === 1} aria-label="Уменьшить количество"><Minus size={14} /></button><input type="number" min="1" max="9999" value={quantity} onChange={(event) => setQuantity(Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} data-testid="craft-quantity" /><button type="button" onClick={() => setQuantity((current) => Math.min(9999, current + 1))} aria-label="Увеличить количество"><Plus size={14} /></button></div>
                </div>
              </section>

              <section className={styles.recipeVariants}>
                <header><span>Шаг 2</span><h3>Вариант рецепта</h3></header>
                <div>{selectedItem.recipes.map((recipe) => <button type="button" className={selectedRecipe.id === recipe.id ? styles.recipeActive : ""} onClick={() => setSelectedRecipeId(recipe.id)} key={recipe.id}><strong>{recipe.name}</strong><small>{recipe.ingredients.length} компонентов</small></button>)}</div>
              </section>

              <section className={styles.summaryCards}>
                <div><span><Layers3 size={16} /></span><small>Разных материалов</small><strong>{finalRequirements.length}</strong></div>
                <div><span><Boxes size={16} /></span><small>Всего единиц</small><strong>{formatAmount(totalRequiredUnits)}</strong></div>
                {hasExtendedAccess && <div className={coveredCrafts >= quantity ? styles.summarySuccess : styles.summaryWarning}><span>{coveredCrafts >= quantity ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><small>Банк покрывает</small><strong>{coveredCrafts} из {quantity}</strong></div>}
              </section>

              <section className={styles.requirementSection}>
                <header><div><span>Прямой рецепт</span><h3>Компоненты для крафта</h3></div><em>{directRequirements.length} позиций</em></header>
                <div className={styles.requirementGrid}>{directRequirements.map((requirement) => <RequirementCard requirement={requirement} key={requirement.slug} />)}</div>
              </section>

              <section className={styles.requirementSection}>
                <header><div><span>Полный расчёт</span><h3>Итоговые материалы</h3></div><em>Вложенные рецепты раскрыты</em></header>
                <div className={styles.finalList}>
                  {finalRequirements.map((requirement) => {
                    const available = clanBalances[requirement.slug] ?? 0;
                    const covered = Math.min(requirement.quantity, available);
                    const missing = Math.max(0, requirement.quantity - available);
                    const distributions = collectiveState.collectives.flatMap((collective) => {
                      const amount = resourceState.balances[collective.id]?.resources[requirement.slug] ?? 0;
                      return amount > 0 ? [{ name: collective.name, amount }] : [];
                    });
                    return (
                      <article className={styles.finalRequirement} key={requirement.slug}>
                        <span className={styles.itemIcon}>{requirement.image ? <LoadableImage src={requirement.image} alt="" width={50} height={50} /> : <Boxes size={19} />}</span>
                        <div className={styles.finalIdentity}><strong>{requirement.name}</strong><small>{typeLabels[requirement.type] ?? requirement.type}{requirement.tier > 0 ? ` · T${requirement.tier}` : ""}</small>{hasExtendedAccess && requirement.type === "resource" && distributions.length > 0 && <em>{distributions.map((entry) => `${entry.name}: ${formatAmount(entry.amount)}`).join(" · ")}</em>}</div>
                        <div className={styles.requiredAmount}><small>Нужно</small><strong>{formatAmount(requirement.quantity)}</strong></div>
                        {hasExtendedAccess && (
                          requirement.type === "resource" ? <div className={styles.bankComparison}><div><span>В банке</span><strong>{formatAmount(available)}</strong></div><div><span>{missing > 0 ? "Не хватает" : "Останется"}</span><strong className={missing > 0 ? styles.missing : styles.enough}>{formatAmount(missing > 0 ? missing : available - requirement.quantity)}</strong></div><i><b style={{ width: `${requirement.quantity > 0 ? Math.min(100, (covered / requirement.quantity) * 100) : 0}%` }} /></i></div>
                            : <div className={styles.notTracked}>Не учитывается<br />в банке ресурсов</div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {hasExtendedAccess ? (
                <section className={styles.bankConclusion}>
                  <span><ShieldCheck size={21} /></span><div><small>Результат сравнения со всеми коллективами</small><h3>{coveredCrafts >= quantity ? "Крафт полностью обеспечен банком" : `Банк покрывает ${coveredCrafts} из ${quantity} крафтов`}</h3><p>Из банка можно выдать {formatAmount(totalCoveredUnits)} из {formatAmount(totalRequiredResourceUnits)} требуемых единиц ресурсов. Наличие предметов, не входящих в ресурсный банк, проверяется отдельно.</p></div>
                </section>
              ) : (
                <section className={styles.personalConclusion}><UserRound size={18} /><div><strong>Личный расчёт готов</strong><p>Сравнение с ресурсами коллективов доступно лидерам клана и коллективов, казначеям и рейд-лидерам.</p></div></section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function RequirementCard({ requirement }: { requirement: Requirement }) {
  return (
    <article className={styles.requirementCard}>
      <span className={styles.itemIcon}>{requirement.image ? <LoadableImage src={requirement.image} alt="" width={48} height={48} /> : <Boxes size={18} />}</span>
      <div><strong>{requirement.name}</strong><small>{typeLabels[requirement.type] ?? requirement.type}{requirement.tier > 0 ? ` · T${requirement.tier}` : ""}</small></div>
      <b>×{formatAmount(requirement.quantity)}</b>
    </article>
  );
}
