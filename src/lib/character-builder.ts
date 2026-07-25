export const CHARACTER_BUILD_SCHEMA_VERSION = 1;

export const builderSetIds = ["one", "two"] as const;
export type BuilderSetId = (typeof builderSetIds)[number];

export const builderQualities = ["uncommon", "rare", "epic"] as const;
export type BuilderQuality = (typeof builderQualities)[number];

export const builderSlotIds = [
  "weapon-primary",
  "weapon-secondary",
  "implant-1",
  "implant-2",
  "implant-3",
  "implant-4",
  "implant-5",
  "implant-6",
  "chip-1",
  "chip-2",
  "chip-3",
  "rune-1",
] as const;
export type BuilderSlotId = (typeof builderSlotIds)[number];

export type BuilderIngredient = {
  slug: string;
  quantity: number;
  type: string;
};

export type BuilderRecipe = {
  id: "regular" | "upgraded" | "overclocked";
  label: string;
  ingredients: BuilderIngredient[];
};

export type BuilderItemVariation = {
  slug: string;
  quality: BuilderQuality;
  image: string | null;
  stats: Array<{ type: string; min: number; max: number }>;
};

export type BuilderEquipmentItem = {
  slug: string;
  name: string;
  englishName: string;
  type: "weapon" | "implant" | "chip" | "rune";
  slot: string | null;
  mastery: string | null;
  tier: number;
  profession: string | null;
  description: string;
  descriptionEffect: string;
  variations: BuilderItemVariation[];
  recipes: BuilderRecipe[];
};

export type BuilderReferenceItem = {
  slug: string;
  name: string;
  englishName: string;
  type: string;
  tier: number;
  quality: string;
  baseSlug: string | null;
  image: string | null;
  ingredients: BuilderIngredient[];
  recipes: BuilderRecipe[];
};

export type BuilderStatAsset = {
  label: string;
  image: string | null;
};

export type BuilderClass = {
  slug: string;
  name: string;
  family: string;
  image: string;
};

export type CharacterBuilderDataset = {
  classes: BuilderClass[];
  equipment: BuilderEquipmentItem[];
  references: BuilderReferenceItem[];
  stats: Record<string, BuilderStatAsset>;
};

export type BuilderItemSelection = {
  itemSlug: string;
  quality: BuilderQuality;
  roll: number;
  secondaryStats: string[];
};

export type BuilderEquipmentSet = Record<BuilderSlotId, BuilderItemSelection | null>;

export type CharacterBuildState = {
  schemaVersion: typeof CHARACTER_BUILD_SCHEMA_VERSION;
  title: string;
  heroClass: string;
  level: number;
  activeSet: BuilderSetId;
  sets: Record<BuilderSetId, BuilderEquipmentSet>;
  selectedArchetypes: string[];
  talentRanks: Record<string, number>;
  masteryRanks: Record<string, number>;
  notes: string;
};

export type SavedCharacterBuild = {
  buildId: string;
  shareSlug: string;
  title: string;
  heroClass: string;
  level: number;
  buildData: CharacterBuildState;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

export function createEmptyEquipmentSet(): BuilderEquipmentSet {
  return Object.fromEntries(builderSlotIds.map((slotId) => [slotId, null])) as BuilderEquipmentSet;
}

export function createDefaultCharacterBuild(heroClass = "legionnary"): CharacterBuildState {
  return {
    schemaVersion: CHARACTER_BUILD_SCHEMA_VERSION,
    title: "Новий білд",
    heroClass,
    level: 20,
    activeSet: "one",
    sets: {
      one: createEmptyEquipmentSet(),
      two: createEmptyEquipmentSet(),
    },
    selectedArchetypes: [],
    talentRanks: {},
    masteryRanks: {},
    notes: "",
  };
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function normalizeSelection(value: unknown): BuilderItemSelection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BuilderItemSelection>;
  const itemSlug = boundedString(candidate.itemSlug, 180);
  const quality = builderQualities.includes(candidate.quality as BuilderQuality)
    ? candidate.quality as BuilderQuality
    : "epic";
  if (!itemSlug) return null;
  const secondaryStats = Array.isArray(candidate.secondaryStats)
    ? [...new Set(candidate.secondaryStats.map((stat) => boundedString(stat, 40)).filter(Boolean))].slice(0, 5)
    : [];
  return {
    itemSlug,
    quality,
    roll: boundedInteger(candidate.roll, 0, 100, 100),
    secondaryStats,
  };
}

function normalizeEquipmentSet(value: unknown): BuilderEquipmentSet {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(builderSlotIds.map((slotId) => [slotId, normalizeSelection(candidate[slotId])])) as BuilderEquipmentSet;
}

function normalizeRankMap(value: unknown, maximumRank: number, maximumEntries: number) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, rank]) => [boundedString(key, 100), boundedInteger(rank, 0, maximumRank, 0)] as const)
      .filter(([key, rank]) => key && rank > 0)
      .slice(0, maximumEntries),
  );
}

export function normalizeCharacterBuildState(value: unknown): CharacterBuildState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CharacterBuildState>;
  const heroClass = boundedString(candidate.heroClass, 80);
  if (!heroClass) return null;
  const rawSets = candidate.sets && typeof candidate.sets === "object"
    ? candidate.sets as Partial<Record<BuilderSetId, unknown>>
    : {};
  const selectedArchetypes = Array.isArray(candidate.selectedArchetypes)
    ? [...new Set(candidate.selectedArchetypes.map((item) => boundedString(item, 40)).filter(Boolean))].slice(0, 3)
    : [];
  return {
    schemaVersion: CHARACTER_BUILD_SCHEMA_VERSION,
    title: boundedString(candidate.title, 80) || "Новий білд",
    heroClass,
    level: boundedInteger(candidate.level, 1, 20, 20),
    activeSet: builderSetIds.includes(candidate.activeSet as BuilderSetId) ? candidate.activeSet as BuilderSetId : "one",
    sets: {
      one: normalizeEquipmentSet(rawSets.one),
      two: normalizeEquipmentSet(rawSets.two),
    },
    selectedArchetypes,
    talentRanks: normalizeRankMap(candidate.talentRanks, 5, 120),
    masteryRanks: normalizeRankMap(candidate.masteryRanks, 2, 40),
    notes: boundedString(candidate.notes, 1200),
  };
}
