import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCharacterStats,
  defenseReductionPercent,
  getArtifactSecondaryRange,
  historicalPenetrationPercent,
  hyperbolicPercent,
  multiplicativeReductionPercent,
} from "../src/lib/character-stat-calculator.ts";

function selection(itemSlug, secondaryStats = [], secondaryStatValues = {}) {
  return {
    itemSlug,
    quality: "uncommon",
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
  weaponSelection.primaryStatValues = { as: 999, pcc: 999, fppen: 999 };

  const result = calculateCharacterStats({
    heroClass: "test",
    level: 10,
    intrinsicStats: { health: 1000, armor: 180, mr: 260, as: 100 },
    selectedArchetypes: ["tank", "hunter"],
    selections: [
      { item: weapon, selection: weaponSelection },
      { item: artifactOne, selection: selection(artifactOne.slug, ["pcc"], { pcc: 999 }) },
      { item: artifactTwo, selection: selection(artifactTwo.slug, ["pcc"], { pcc: 60 }) },
    ],
  });

  assert.equal(result.artifactRatings.pcc, 120);
  assert.equal(Number(result.values.pcc.toFixed(4)), Number((hyperbolicPercent(120, 950) + 5).toFixed(4)));
  assert.equal(result.values.health, 1100);
  assert.equal(result.values.as, 0.77);
  assert.equal(result.values.fppen, 20);
  assert.equal(result.values.pcp, 150);
  assert.equal(result.values.pdecrease, 50);
  assert.equal(Number(result.values.mdecrease.toFixed(2)), 59.09);
});
