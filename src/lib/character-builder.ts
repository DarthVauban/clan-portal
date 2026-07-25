export const CHARACTER_BUILD_SCHEMA_VERSION = 2;

export const builderSetIds = ["one", "two"] as const;
export type BuilderSetId = (typeof builderSetIds)[number];

export const builderQualities = ["uncommon", "rare", "epic"] as const;
export type BuilderQuality = (typeof builderQualities)[number];

export const builderWeaponSlotIds = [
  "weapon-primary",
  "chip-1",
  "chip-2",
  "chip-3",
] as const;
export type BuilderWeaponSlotId = (typeof builderWeaponSlotIds)[number];

export const builderArtifactSlotIds = [
  "implant-1",
  "implant-2",
  "implant-3",
  "implant-4",
  "implant-5",
  "implant-6",
] as const;
export type BuilderArtifactSlotId = (typeof builderArtifactSlotIds)[number];

export const builderSlotIds = [...builderWeaponSlotIds, ...builderArtifactSlotIds] as const;
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

export type BuilderEquipmentSet = Record<BuilderWeaponSlotId, BuilderItemSelection | null>;
export type BuilderArtifactSet = Record<BuilderArtifactSlotId, BuilderItemSelection | null>;

export type CharacterBuildState = {
  schemaVersion: typeof CHARACTER_BUILD_SCHEMA_VERSION;
  title: string;
  heroClass: string;
  level: number;
  activeSet: BuilderSetId;
  sets: Record<BuilderSetId, BuilderEquipmentSet>;
  artifacts: BuilderArtifactSet;
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
  return Object.fromEntries(builderWeaponSlotIds.map((slotId) => [slotId, null])) as BuilderEquipmentSet;
}

export function createEmptyArtifactSet(): BuilderArtifactSet {
  return Object.fromEntries(builderArtifactSlotIds.map((slotId) => [slotId, null])) as BuilderArtifactSet;
}

export function createDefaultCharacterBuild(heroClass = "legionnary"): CharacterBuildState {
  return {
    schemaVersion: CHARACTER_BUILD_SCHEMA_VERSION,
    title: "Новый билд",
    heroClass,
    level: 20,
    activeSet: "one",
    sets: {
      one: createEmptyEquipmentSet(),
      two: createEmptyEquipmentSet(),
    },
    artifacts: createEmptyArtifactSet(),
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
  return Object.fromEntries(
    builderWeaponSlotIds.map((slotId) => [slotId, normalizeSelection(candidate[slotId])]),
  ) as BuilderEquipmentSet;
}

function normalizeArtifactSet(value: unknown): BuilderArtifactSet {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    builderArtifactSlotIds.map((slotId) => [slotId, normalizeSelection(candidate[slotId])]),
  ) as BuilderArtifactSet;
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

const legacyArchetypeAliases: Record<string, string> = {
  assassin: "assassin",
  sharpshooter: "hunter",
  guardian: "tank",
  warlock: "mage",
  duelist: "warrior",
  medic: "medic",
  trickster: "pathfinder",
  berserker: "support",
};

function normalizeTalentRankMap(value: unknown) {
  const normalized = normalizeRankMap(value, 5, 120);
  const migrated: Record<string, number> = {};
  for (const [nodeId, rank] of Object.entries(normalized)) {
    const separator = nodeId.lastIndexOf("-");
    if (separator < 1) continue;
    const archetypeId = nodeId.slice(0, separator);
    const nodeNumber = nodeId.slice(separator + 1);
    const mappedId = legacyArchetypeAliases[archetypeId] ?? archetypeId;
    migrated[`${mappedId}-${nodeNumber}`] = Math.max(migrated[`${mappedId}-${nodeNumber}`] ?? 0, rank);
  }
  return migrated;
}

function constrainTalentRankMap(ranks: Record<string, number>, selectedArchetypes: string[]) {
  const selected = new Set(selectedArchetypes);
  const occupiedRows = new Set<string>();
  const constrained: Record<string, number> = {};
  let allocation = 0;
  let levelPoints = 0;

  for (const [nodeId, rank] of Object.entries(ranks)) {
    const separator = nodeId.lastIndexOf("-");
    const archetypeId = separator > 0 ? nodeId.slice(0, separator) : "";
    const nodeNumber = Number(nodeId.slice(separator + 1));
    if (!selected.has(archetypeId) || !Number.isInteger(nodeNumber) || nodeNumber < 1 || nodeNumber > 15) continue;
    const rowId = `${archetypeId}-${Math.ceil(nodeNumber / 3)}`;
    if (occupiedRows.has(rowId) || allocation >= 15) continue;
    const safeRank = Math.min(rank, 1 + Math.max(0, 12 - levelPoints));
    constrained[nodeId] = safeRank;
    occupiedRows.add(rowId);
    allocation += 1;
    levelPoints += Math.max(0, safeRank - 1);
  }
  return constrained;
}

function normalizeMasteryRankMap(value: unknown, heroClass: string) {
  const normalized = normalizeRankMap(value, 3, 180);
  const migrated: Record<string, number> = {};
  let allocation = 0;
  let levelPoints = 0;
  for (const [nodeId, rank] of Object.entries(normalized)) {
    const legacyRoot = nodeId.match(new RegExp(`^${heroClass}-mastery-([1-4])-6$`));
    const mappedId = legacyRoot ? `${heroClass}-branch-${legacyRoot[1]}-root` : nodeId;
    const valid = (
      new RegExp(`^${heroClass}-mastery-[1-4]-[1-5]$`).test(mappedId)
      || new RegExp(`^${heroClass}-final-[1-2]$`).test(mappedId)
      || new RegExp(`^${heroClass}-mastery-link-r[1-4]c[1-5]-r[1-4]c[1-5]-boost-[12]$`).test(mappedId)
    );
    if (!valid || allocation >= 26 || migrated[mappedId]) continue;
    const safeRank = mappedId.includes("-mastery-link-")
      ? 1
      : Math.min(rank, 1 + Math.max(0, 2 - levelPoints));
    migrated[mappedId] = safeRank;
    allocation += 1;
    levelPoints += Math.max(0, safeRank - 1);
  }
  return migrated;
}

export function normalizeCharacterBuildState(value: unknown): CharacterBuildState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const heroClass = boundedString(candidate.heroClass, 80);
  if (!heroClass) return null;

  const rawSets = candidate.sets && typeof candidate.sets === "object"
    ? candidate.sets as Partial<Record<BuilderSetId, unknown>>
    : {};
  const firstSetCandidate = rawSets.one && typeof rawSets.one === "object"
    ? rawSets.one as Record<string, unknown>
    : {};
  const sets = {
    one: normalizeEquipmentSet(rawSets.one),
    two: normalizeEquipmentSet(rawSets.two),
  };

  // В старой схеме в первом комплекте было два оружия. Второе безопасно
  // переносим во второй оружейный комплект, если тот ещё пуст.
  if (!sets.two["weapon-primary"]) {
    sets.two["weapon-primary"] = normalizeSelection(firstSetCandidate["weapon-secondary"]);
  }

  const rawArtifacts = candidate.artifacts ?? rawSets.one;
  const selectedArchetypes = Array.isArray(candidate.selectedArchetypes)
    ? [...new Set(candidate.selectedArchetypes
      .map((item) => boundedString(item, 40))
      .filter(Boolean)
      .map((item) => legacyArchetypeAliases[item] ?? item))]
      .slice(0, 3)
    : [];

  return {
    schemaVersion: CHARACTER_BUILD_SCHEMA_VERSION,
    title: boundedString(candidate.title, 80) || "Новый билд",
    heroClass,
    level: boundedInteger(candidate.level, 1, 20, 20),
    activeSet: builderSetIds.includes(candidate.activeSet as BuilderSetId) ? candidate.activeSet as BuilderSetId : "one",
    sets,
    artifacts: normalizeArtifactSet(rawArtifacts),
    selectedArchetypes,
    talentRanks: constrainTalentRankMap(normalizeTalentRankMap(candidate.talentRanks), selectedArchetypes),
    masteryRanks: normalizeMasteryRankMap(candidate.masteryRanks, heroClass),
    notes: boundedString(candidate.notes, 1200),
  };
}
