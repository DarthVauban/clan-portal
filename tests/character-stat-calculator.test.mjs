import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCharacterStats,
  defenseReductionPercent,
  getArtifactSecondaryRange,
  historicalPenetrationPercent,
  hyperbolicPercent,
  multiplicativeReductionPercent,
  updateWeaponPrimaryStatValues,
} from "../src/lib/character-stat-calculator.ts";
import {
  createDefaultCharacterBuild,
  getBuilderModificationSlotLimit,
  getSecondaryStatSlotKey,
  getSecondaryStatValue,
  normalizeCharacterBuildState,
} from "../src/lib/character-builder.ts";

function selection(itemSlug, secondaryStats = [], secondaryStatValues = {}) {
  return {
    itemSlug,
    quality: "uncommon",
    craftVariant: "regular",
    roll: 100,
    secondaryStats,
    primaryStatValues: {},
    secondaryStatValues,
    effectValues: {},
  };
}

test("v0.114 control points stay stable", () => {
  assert.equal(hyperbolicPercent(950, 950), 50);
  assert.equal(defenseReductionPercent(180), 50);
  assert.equal(Number(defenseReductionPercent(260).toFixed(2)), 59.09);
  assert.equal(defenseReductionPercent(900), 75);
  assert.equal(Number(historicalPenetrationPercent(160).toFixed(2)), 18.6);
  assert.equal(historicalPenetrationPercent(300), 30);
  assert.equal(historicalPenetrationPercent(900), 50);
  assert.equal(multiplicativeReductionPercent([30, 20]), 44);
  assert.equal(hyperbolicPercent(600, 400), 60);
});

test("artifact one-roll limits match the documented baskets", () => {
  assert.deepEqual(getArtifactSecondaryRange("pcc"), {
    minimum: 30,
    maximum: 60,
    confidence: "confirmed",
  });
  assert.equal(getArtifactSecondaryRange("fppen").maximum, 10);
  assert.equal(getArtifactSecondaryRange("mregen").maximum, 120);
});

test("ratings aggregate once while weapon bonuses remain direct", () => {
  const weapon = {
    slug: "test-weapon",
    name: "Test weapon",
    englishName: "Test weapon",
    type: "weapon",
    slot: null,
    mastery: null,
    tier: 3,
    profession: null,
    description: "",
    descriptionEffect: "",
    recipes: [],
    variations: [{
      slug: "test-weapon-uncommon",
      quality: "uncommon",
      image: null,
      stats: [
        { type: "wd", min: 200, max: 200 },
        { type: "as", min: 0.7, max: 0.7 },
        { type: "pcc", min: 5, max: 5 },
        { type: "fppen", min: 20, max: 20 },
      ],
      effects: [],
    }],
  };
  const artifact = (slug) => ({
    slug,
    name: slug,
    englishName: slug,
    type: "implant",
    slot: null,
    mastery: null,
    tier: 3,
    profession: null,
    description: "",
    descriptionEffect: "",
    recipes: [],
    variations: [{
      slug: `${slug}-uncommon`,
      quality: "uncommon",
      image: null,
      stats: [],
      effects: [],
    }],
  });
  const artifactOne = artifact("artifact-one");
  const artifactTwo = artifact("artifact-two");
  const weaponSelection = selection(weapon.slug);
  weaponSelection.primaryStatValues = { wd: 999, as: 999, pcc: 999, fppen: 999 };

  const result = calculateCharacterStats({
    intrinsicStats: { ap: 10, health: 1000, armor: 180, mr: 260, as: 1 },
    selectedArchetypes: ["tank", "hunter"],
    selections: [
      { item: weapon, selection: weaponSelection },
      { item: artifactOne, selection: selection(artifactOne.slug, ["pcc"], { pcc: 999 }) },
      { item: artifactTwo, selection: selection(artifactTwo.slug, ["pcc"], { pcc: 60 }) },
    ],
  });

  assert.equal(result.artifactRatings.pcc, 120);
  assert.equal(Number(result.values.pcc.toFixed(4)), Number((hyperbolicPercent(120, 950) + 5).toFixed(4)));
  assert.equal(result.values.ap, 200);
  assert.equal(result.values.health, 1100);
  assert.equal(result.values.as, 0.77);
  assert.equal(result.values.fppen, 20);
  assert.equal(result.values.pcp, 150);
  assert.equal(result.values.pdecrease, 50);
  assert.equal(Number(result.values.mdecrease.toFixed(2)), 59.09);
});

test("clean base attack power is replaced by equipped weapon damage", () => {
  const cleanResult = calculateCharacterStats({
    intrinsicStats: { ap: 10, as: 0.7 },
    selectedArchetypes: [],
    selections: [],
  });
  assert.equal(cleanResult.values.ap, 10);

  const weapon = {
    slug: "replacement-ap-weapon",
    name: "Replacement AP weapon",
    englishName: "Replacement AP weapon",
    type: "weapon",
    slot: null,
    mastery: null,
    tier: 1,
    profession: null,
    description: "",
    descriptionEffect: "",
    recipes: [],
    variations: [{
      slug: "replacement-ap-weapon-uncommon",
      quality: "uncommon",
      image: null,
      stats: [
        { type: "wd", min: 75, max: 75 },
        { type: "as", min: 0.7, max: 0.7 },
      ],
      effects: [],
    }],
  };
  const weaponResult = calculateCharacterStats({
    intrinsicStats: { ap: 10, as: 0.7 },
    selectedArchetypes: [],
    selections: [{ item: weapon, selection: selection(weapon.slug) }],
  });
  assert.equal(weaponResult.values.ap, 75);
});

test("repeated artifact affixes keep independent slot values", () => {
  const artifact = {
    slug: "repeated-roll-artifact",
    name: "Repeated roll artifact",
    englishName: "Repeated roll artifact",
    type: "implant",
    slot: null,
    mastery: null,
    tier: 2,
    profession: null,
    description: "",
    descriptionEffect: "",
    recipes: [],
    variations: [{
      slug: "repeated-roll-artifact-epic",
      quality: "epic",
      image: null,
      stats: [],
      effects: [],
    }],
  };
  const repeatedSelection = selection(
    artifact.slug,
    ["as", "as", "as", "as", "as"],
    {
      [getSecondaryStatSlotKey(0)]: 60,
      [getSecondaryStatSlotKey(1)]: 50,
      [getSecondaryStatSlotKey(2)]: 40,
      [getSecondaryStatSlotKey(3)]: 30,
      [getSecondaryStatSlotKey(4)]: 20,
    },
  );
  repeatedSelection.quality = "epic";

  const result = calculateCharacterStats({
    intrinsicStats: { as: 0.7 },
    selectedArchetypes: [],
    selections: [{ item: artifact, selection: repeatedSelection }],
  });

  assert.equal(result.artifactRatings.as, 200);
  assert.equal(result.values.asrating, 200);
  assert.equal(result.values.as, 0.9333);
});

test("weapon damage and attack speed stay on the same inverse roll", () => {
  const stats = [
    { type: "as", min: 0.25, max: 0.8 },
    { type: "wd", min: 50, max: 200 },
  ];

  assert.deepEqual(
    updateWeaponPrimaryStatValues(stats, {}, "wd", 200),
    { wd: 200, as: 0.25 },
  );
  assert.deepEqual(
    updateWeaponPrimaryStatValues(stats, {}, "as", 0.8),
    { as: 0.8, wd: 50 },
  );
  assert.deepEqual(
    updateWeaponPrimaryStatValues(stats, {}, "wd", 125),
    { wd: 125, as: 0.525 },
  );
});

test("attack speed is capped at 2.5 for every class", () => {
  const weapon = {
    slug: "fast-weapon",
    name: "Fast weapon",
    englishName: "Fast weapon",
    type: "weapon",
    slot: null,
    mastery: null,
    tier: 3,
    profession: null,
    description: "",
    descriptionEffect: "",
    recipes: [],
    variations: [{
      slug: "fast-weapon-uncommon",
      quality: "uncommon",
      image: null,
      stats: [{ type: "as", min: 2.4, max: 2.4 }],
      effects: [{
        id: "attack-speed-boost",
        description: "",
        statType: "as",
        min: 100,
        max: 100,
        suffix: "%",
        direction: 1,
      }],
    }],
  };

  const result = calculateCharacterStats({
    intrinsicStats: { as: 1.5 },
    selectedArchetypes: [],
    selections: [{ item: weapon, selection: selection(weapon.slug) }],
  });

  assert.equal(result.values.as, 2.5);
});

test("legacy stat-keyed artifact values migrate without removing duplicate affixes", () => {
  const draft = createDefaultCharacterBuild();
  draft.level = 1;
  draft.artifacts["implant-1"] = selection(
    "legacy-artifact",
    ["pcc", "pcc", "pcc"],
    { pcc: 45 },
  );

  const normalized = normalizeCharacterBuildState(draft);
  const migrated = normalized.artifacts["implant-1"];
  assert.ok(migrated);
  assert.equal(normalized.level, 20);
  assert.deepEqual(migrated.secondaryStats, ["pcc", "pcc", "pcc"]);
  assert.deepEqual(
    migrated.secondaryStats.map((_, index) => getSecondaryStatValue(migrated, index)),
    [45, 45, 45],
  );
});

test("grade and craft type independently control modification slots", () => {
  assert.equal(getBuilderModificationSlotLimit(2, "epic", "regular"), 3);
  assert.equal(getBuilderModificationSlotLimit(2, "epic", "upgraded"), 4);
  assert.equal(getBuilderModificationSlotLimit(2, "epic", "overclocked"), 5);
  assert.equal(getBuilderModificationSlotLimit(2, "common", "regular"), 0);
  assert.equal(getBuilderModificationSlotLimit(2, "common", "upgraded"), 1);
  assert.equal(getBuilderModificationSlotLimit(2, "common", "overclocked"), 2);
  assert.equal(getBuilderModificationSlotLimit(3, "epic", "regular"), 3);
  assert.equal(getBuilderModificationSlotLimit(3, "epic", "upgraded"), 3);
  assert.equal(getBuilderModificationSlotLimit(3, "epic", "overclocked"), 3);
});

test("v5 equipment selections migrate the old combined quality into craft type", () => {
  const draft = createDefaultCharacterBuild();
  draft.schemaVersion = 5;
  const legacySelection = selection("legacy-weapon");
  legacySelection.quality = "rare";
  delete legacySelection.craftVariant;
  draft.sets.one["weapon-primary"] = legacySelection;

  const normalized = normalizeCharacterBuildState(draft);
  assert.equal(normalized.schemaVersion, 6);
  assert.equal(normalized.sets.one["weapon-primary"].quality, "rare");
  assert.equal(normalized.sets.one["weapon-primary"].craftVariant, "upgraded");
});
