import type {
  BuilderEquipmentItem,
  BuilderItemSelection,
  BuilderItemVariation,
} from "@/lib/character-builder";

export const COREPUNK_CALCULATOR_VERSION = "0.114";

export type FormulaConfidence =
  | "confirmed"
  | "strong-inference"
  | "historical"
  | "provisional"
  | "unknown";

export type ArtifactSecondaryRange = {
  minimum: number;
  maximum: number;
  confidence: FormulaConfidence;
};

/**
 * One-roll limits for artifact secondary affixes.
 *
 * Confirmed values come from the v0.114 technical specification. The remaining
 * baskets are isolated here as provisional values, so a new measured range can
 * be swapped without touching the calculator or the equipment modal.
 */
export const artifactSecondaryRanges: Record<string, ArtifactSecondaryRange> = {
  pcp: { minimum: 30, maximum: 60, confidence: "confirmed" },
  mcp: { minimum: 40, maximum: 80, confidence: "confirmed" },
  pcc: { minimum: 30, maximum: 60, confidence: "confirmed" },
  mcc: { minimum: 20, maximum: 40, confidence: "confirmed" },
  ppen: { minimum: 20, maximum: 40, confidence: "confirmed" },
  mpen: { minimum: 20, maximum: 40, confidence: "confirmed" },
  ccres: { minimum: 20, maximum: 40, confidence: "confirmed" },
  lifesteal: { minimum: 10, maximum: 20, confidence: "confirmed" },
  fppen: { minimum: 5, maximum: 10, confidence: "confirmed" },
  fmpen: { minimum: 5, maximum: 10, confidence: "confirmed" },
  mregen: { minimum: 60, maximum: 120, confidence: "confirmed" },
  as: { minimum: 30, maximum: 60, confidence: "provisional" },
  cast: { minimum: 20, maximum: 40, confidence: "provisional" },
  bleed: { minimum: 20, maximum: 40, confidence: "provisional" },
  corruption: { minimum: 20, maximum: 40, confidence: "provisional" },
  slowres: { minimum: 20, maximum: 40, confidence: "provisional" },
  cd: { minimum: 20, maximum: 40, confidence: "provisional" },
  costred: { minimum: 20, maximum: 40, confidence: "provisional" },
  abilitysteal: { minimum: 10, maximum: 20, confidence: "provisional" },
  hregen: { minimum: 60, maximum: 120, confidence: "provisional" },
};

export const percentageStatIds = new Set([
  "pcc",
  "pcp",
  "ppen",
  "increase",
  "bleed",
  "mcc",
  "mcp",
  "mpen",
  "corruption",
  "slowres",
  "ccres",
  "pdecrease",
  "mdecrease",
  "cd",
  "costred",
  "lifesteal",
  "abilitysteal",
  "haspincrease",
  "acpc",
]);

const mainFlatStatIds = new Set([
  "ap",
  "sp",
  "health",
  "mana",
  "armor",
  "mr",
  "wd",
  "hasp",
  "ms",
  "hregen",
  "mregen",
  "aggro",
  "ccd",
  "mchc",
]);

const directPercentStatIds = new Set([
  "pcc",
  "pcp",
  "ppen",
  "increase",
  "bleed",
  "mcc",
  "mcp",
  "mpen",
  "corruption",
  "slowres",
  "ccres",
  "pdecrease",
  "mdecrease",
  "cd",
  "costred",
  "lifesteal",
  "abilitysteal",
  "haspincrease",
  "acpc",
]);

const flatPenetrationStatIds = new Set(["fppen", "fmpen"]);

const zeroBaseStats: Record<string, number> = {
  ap: 0,
  sp: 0,
  health: 0,
  mana: 0,
  armor: 0,
  mr: 0,
  wd: 0,
  hasp: 0,
  ms: 0,
  hregen: 0,
  mregen: 0,
  pcc: 0,
  pcp: 150,
  fppen: 0,
  ppen: 0,
  increase: 0,
  bleed: 0,
  cast: 0,
  mcc: 0,
  mcp: 150,
  fmpen: 0,
  mpen: 0,
  corruption: 0,
  slowres: 0,
  ccres: 0,
  pdecrease: 0,
  mdecrease: 0,
  cd: 0,
  costred: 0,
  lifesteal: 0,
  abilitysteal: 0,
  haspincrease: 0,
  as: 0,
  asrating: 0,
};

export type CharacterStatSelection = {
  item: BuilderEquipmentItem;
  selection: BuilderItemSelection;
};

export type CharacterStatCalculationInput = {
  intrinsicStats: Record<string, number>;
  selections: CharacterStatSelection[];
  selectedArchetypes: string[];
};

export type CharacterStatCalculationResult = {
  values: Record<string, number>;
  artifactRatings: Record<string, number>;
  directPercent: Record<string, number>;
  directFlat: Record<string, number>;
  version: typeof COREPUNK_CALCULATOR_VERSION;
};

type MutableSources = {
  mainFlat: Record<string, number>;
  artifactRating: Record<string, number>;
  directFlat: Record<string, number>;
  directPercent: Record<string, number>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeNumber(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function getSelectionSecondaryStatValue(selection: BuilderItemSelection, index: number) {
  const slotValue = selection.secondaryStatValues[`slot:${index}`];
  if (Number.isFinite(slotValue)) return Number(slotValue);
  const legacyStat = selection.secondaryStats[index];
  const legacyValue = legacyStat ? selection.secondaryStatValues[legacyStat] : undefined;
  return Number.isFinite(legacyValue) ? Number(legacyValue) : 0;
}

function add(target: Record<string, number>, stat: string, value: number) {
  target[stat] = (target[stat] ?? 0) + value;
}

export function getArtifactSecondaryRange(stat: string): ArtifactSecondaryRange {
  return artifactSecondaryRanges[stat]
    ?? { minimum: 0, maximum: 100, confidence: "unknown" };
}

export function hyperbolicPercent(rating: number, constant: number) {
  const safeRating = Math.max(0, rating);
  return safeRating <= 0 ? 0 : (100 * safeRating) / (safeRating + constant);
}

export function defenseReductionPercent(defenseRating: number) {
  // The current post-soft-cap curve is not recovered. Do not invent gains above
  // the confirmed 75% boundary until measured v0.114 data becomes available.
  return Math.min(75, hyperbolicPercent(defenseRating, 180));
}

export function historicalPenetrationPercent(rating: number) {
  const safeRating = Math.max(0, rating);
  const effective = safeRating <= 300
    ? safeRating
    : 300 + (safeRating - 300) * (2 / 3);
  return hyperbolicPercent(effective, 700);
}

export function multiplicativeReductionPercent(reductions: number[]) {
  const remaining = reductions.reduce(
    (result, reduction) => result * (1 - clamp(reduction / 100, 0, 1)),
    1,
  );
  return Math.round((1 - remaining) * 1_000_000) / 10_000;
}

function convertArtifactRating(stat: string, rating: number) {
  switch (stat) {
    case "pcc":
    case "mcc":
      return hyperbolicPercent(rating, 950);
    case "pcp":
    case "mcp":
      return hyperbolicPercent(rating, 850);
    case "bleed":
    case "corruption":
    case "slowres":
    case "ccres":
      return hyperbolicPercent(rating, 400);
    case "costred":
      return hyperbolicPercent(rating, 500);
    case "as":
      return hyperbolicPercent(rating, 400);
    case "lifesteal":
    case "abilitysteal":
      return hyperbolicPercent(rating, 800);
    case "cd":
      return hyperbolicPercent(rating, 700);
    case "ppen":
    case "mpen":
      return historicalPenetrationPercent(rating);
    case "fppen":
    case "fmpen":
    case "cast":
    case "hregen":
    case "mregen":
      return rating;
    default:
      return 0;
  }
}

function findVariation(item: BuilderEquipmentItem, selection: BuilderItemSelection) {
  return item.variations.find((variation) => variation.quality === selection.quality)
    ?? item.variations[0]
    ?? null;
}

function getPrimaryValue(
  selection: BuilderItemSelection,
  stat: BuilderItemVariation["stats"][number],
) {
  const fallback = stat.min + (stat.max - stat.min) * (selection.roll / 100);
  return clamp(safeNumber(selection.primaryStatValues[stat.type], fallback), 0, stat.max);
}

function roundPrimaryStat(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function updateWeaponPrimaryStatValues(
  stats: BuilderItemVariation["stats"],
  currentValues: Record<string, number>,
  changedStat: string,
  changedValue: number,
) {
  const nextValues = {
    ...currentValues,
    [changedStat]: roundPrimaryStat(changedValue),
  };
  if (changedStat !== "wd" && changedStat !== "as") return nextValues;

  const source = stats.find((stat) => stat.type === changedStat);
  const coupled = stats.find((stat) => stat.type === (changedStat === "wd" ? "as" : "wd"));
  if (!source || !coupled) return nextValues;

  const sourceRange = source.max - source.min;
  const progress = sourceRange > 0
    ? (clamp(changedValue, source.min, source.max) - source.min) / sourceRange
    : 0;
  nextValues[changedStat] = roundPrimaryStat(clamp(changedValue, source.min, source.max));
  nextValues[coupled.type] = roundPrimaryStat(
    coupled.max - progress * (coupled.max - coupled.min),
  );
  return nextValues;
}

function collectPrimaryStat(
  sources: MutableSources,
  item: BuilderEquipmentItem,
  stat: string,
  value: number,
) {
  if (item.type === "weapon" && stat === "as") {
    // Weapon attack speed is attacks per second, not artifact AS rating.
    sources.mainFlat.as = Math.max(sources.mainFlat.as ?? 0, value);
    return;
  }
  if (flatPenetrationStatIds.has(stat)) {
    add(sources.directFlat, stat, value);
    return;
  }
  if (item.type === "weapon" && directPercentStatIds.has(stat)) {
    add(sources.directPercent, stat, value);
    return;
  }
  add(sources.mainFlat, stat, value);
}

function collectEffect(
  sources: MutableSources,
  variation: BuilderItemVariation,
  selection: BuilderItemSelection,
) {
  for (const effect of variation.effects) {
    if (!effect.statType) continue;
    const fallback = effect.min + (effect.max - effect.min) * (selection.roll / 100);
    const value = clamp(safeNumber(selection.effectValues[effect.id], fallback), 0, effect.max)
      * effect.direction;
    if (effect.suffix === "%") add(sources.directPercent, effect.statType, value);
    else if (effect.statType === "as") add(sources.artifactRating, effect.statType, value);
    else add(sources.directFlat, effect.statType, value);
  }
}

function collectArchetypeBonuses(sources: MutableSources, selectedArchetypes: string[]) {
  const selected = new Set(selectedArchetypes);
  if (selected.has("warrior")) add(sources.directPercent, "increase", 5);
  if (selected.has("tank")) {
    add(sources.directPercent, "health", 10);
    add(sources.directPercent, "aggro", 50);
  }
  if (selected.has("mage")) add(sources.directPercent, "mana", 10);
  if (selected.has("assassin")) {
    add(sources.directPercent, "pcc", 5);
    add(sources.directPercent, "mcc", 5);
    add(sources.directPercent, "aggro", -20);
  }
  if (selected.has("hunter")) add(sources.directPercent, "as", 10);
  if (selected.has("medic")) add(sources.directPercent, "haspincrease", 10);
  if (selected.has("pathfinder")) add(sources.directPercent, "hregen", 2);
  if (selected.has("support")) add(sources.directPercent, "ms", 5);
}

export function calculateCharacterStats({
  intrinsicStats,
  selections,
  selectedArchetypes,
}: CharacterStatCalculationInput): CharacterStatCalculationResult {
  const sources: MutableSources = {
    mainFlat: {},
    artifactRating: {},
    directFlat: {},
    directPercent: {},
  };
  let weaponAttackSpeed: number | null = null;
  let weaponDamage: number | null = null;

  for (const { item, selection } of selections) {
    const variation = findVariation(item, selection);
    if (!variation) continue;

    const primaryValues = Object.fromEntries(
      variation.stats.map((stat) => [stat.type, getPrimaryValue(selection, stat)]),
    );
    const normalizedPrimaryValues = item.type === "weapon" && primaryValues.wd !== undefined
      ? updateWeaponPrimaryStatValues(variation.stats, primaryValues, "wd", primaryValues.wd)
      : primaryValues;

    for (const stat of variation.stats) {
      const value = normalizedPrimaryValues[stat.type] ?? getPrimaryValue(selection, stat);
      collectPrimaryStat(sources, item, stat.type, value);
      if (item.type === "weapon" && stat.type === "as") weaponAttackSpeed = value;
      if (item.type === "weapon" && stat.type === "wd") weaponDamage = value;
    }

    if (item.type === "implant") {
      selection.secondaryStats.forEach((stat, index) => {
        const range = getArtifactSecondaryRange(stat);
        const value = clamp(
          safeNumber(getSelectionSecondaryStatValue(selection, index)),
          0,
          range.maximum,
        );
        add(sources.artifactRating, stat, value);
      });
    }

    collectEffect(sources, variation, selection);
  }

  collectArchetypeBonuses(sources, selectedArchetypes);

  const intrinsic = { ...intrinsicStats };
  const values: Record<string, number> = { ...zeroBaseStats };

  for (const stat of new Set([
    ...Object.keys(intrinsic),
    ...Object.keys(sources.mainFlat),
    ...Object.keys(sources.directFlat),
  ])) {
    if (stat === "as") continue;
    values[stat] = (intrinsic[stat] ?? 0)
      + (sources.mainFlat[stat] ?? 0)
      + (sources.directFlat[stat] ?? 0);
  }

  // A clean hero has 10 base AP. Equipping a weapon replaces that base with
  // Weapon Damage; explicit AP bonuses are then added on top.
  values.ap = (weaponDamage ?? intrinsic.ap ?? 0)
    + (sources.mainFlat.ap ?? 0)
    + (sources.directFlat.ap ?? 0);

  for (const stat of mainFlatStatIds) {
    const multiplier = sources.directPercent[stat] ?? 0;
    if (multiplier !== 0) values[stat] = (values[stat] ?? 0) * (1 + multiplier / 100);
  }

  for (const stat of [
    "pcc",
    "ppen",
    "bleed",
    "mcc",
    "mpen",
    "corruption",
    "slowres",
    "ccres",
    "cd",
    "costred",
    "lifesteal",
    "abilitysteal",
  ]) {
    values[stat] = clamp(
      convertArtifactRating(stat, sources.artifactRating[stat] ?? 0)
        + (sources.directPercent[stat] ?? 0),
      0,
      100,
    );
  }

  values.pcp = 150
    + convertArtifactRating("pcp", sources.artifactRating.pcp ?? 0)
    + (sources.directPercent.pcp ?? 0);
  values.mcp = 150
    + convertArtifactRating("mcp", sources.artifactRating.mcp ?? 0)
    + (sources.directPercent.mcp ?? 0);
  values.fppen = (sources.artifactRating.fppen ?? 0) + (sources.directFlat.fppen ?? 0);
  values.fmpen = (sources.artifactRating.fmpen ?? 0) + (sources.directFlat.fmpen ?? 0);
  values.cast = (sources.artifactRating.cast ?? 0) + (sources.directFlat.cast ?? 0);
  values.hregen = (values.hregen ?? 0) + (sources.artifactRating.hregen ?? 0);
  values.mregen = (values.mregen ?? 0) + (sources.artifactRating.mregen ?? 0);
  values.increase = sources.directPercent.increase ?? 0;
  values.haspincrease = sources.directPercent.haspincrease ?? 0;

  const baseAttackSpeed = weaponAttackSpeed ?? intrinsic.as ?? 0;
  values.asrating = sources.artifactRating.as ?? 0;
  const attackSpeedFromRating = baseAttackSpeed
    * (1 + convertArtifactRating("as", values.asrating) / 100);
  values.as = Math.min(
    2.5,
    attackSpeedFromRating * (1 + (sources.directPercent.as ?? 0) / 100),
  );

  const armorReduction = defenseReductionPercent(values.armor ?? 0);
  const magicReduction = defenseReductionPercent(values.mr ?? 0);
  values.pdecrease = multiplicativeReductionPercent([
    armorReduction,
    sources.directPercent.pdecrease ?? 0,
  ]);
  values.mdecrease = multiplicativeReductionPercent([
    magicReduction,
    sources.directPercent.mdecrease ?? 0,
  ]);

  for (const [stat, value] of Object.entries(values)) {
    values[stat] = Math.round(value * 10_000) / 10_000;
  }

  return {
    values,
    artifactRatings: sources.artifactRating,
    directPercent: sources.directPercent,
    directFlat: sources.directFlat,
    version: COREPUNK_CALCULATOR_VERSION,
  };
}
