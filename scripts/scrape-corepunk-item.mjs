import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE = "https://corepunk.help";
const API_BASE = `${SITE_BASE}/api/items`;
const ASSET_BASE = "https://d2fwno52vggyhx.cloudfront.net";
const rootSlug = process.argv[2] ?? "implant-arcane-buster-t3";
const publicDir = path.resolve("public");
const dataDir = path.resolve("src", "data");

const statLabels = {
  ap: "Attack Power",
  armor: "Armor",
  cd: "Cooldown",
  health: "Health",
  mana: "Mana",
  md: "Magic Damage",
  mr: "Magic Resistance",
  pd: "Physical Damage",
  sp: "Spell Power",
  vr: "Vampirism",
};

const descriptionIconTokens = new Set([
  "ap",
  "armor",
  "cd",
  "health",
  "mana",
  "mr",
  "sp",
  "vr",
]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function secondaryStatsForQuality(quality) {
  const slots = { common: 0, uncommon: 1, rare: 2, epic: 3 }[quality] ?? 0;
  return Array.from({ length: slots }, (_, index) => ({
    id: `random-secondary-${index + 1}`,
    type: "random",
    min: null,
    max: null,
    label: "Random secondary stat",
  }));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "ClanPortalItemImporter/0.1 (+local test import)" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  return response.json();
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "ClanPortalItemImporter/0.1 (+local test import)" },
  });

  if (!response.ok) {
    return false;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return true;
}

function itemAsset(item) {
  const assetType = item.assetType ?? item.type;
  return {
    remote: `${ASSET_BASE}/items/${assetType}/${item.slug}.png`,
    local: `/game-assets/items/${assetType}/${item.slug}.png`,
  };
}

function collectDescriptionTokens(item) {
  const descriptions = [item.description, item.descriptionEffect, item.specialEffect?.descriptionEffect]
    .filter(Boolean)
    .join(" ");

  return [...descriptions.matchAll(/\[([a-z][a-z0-9_-]*)\]/gi)].map((match) => match[1].toLowerCase());
}

function collectRelationRequests(item) {
  const requests = new Map();

  for (const ingredient of item.ingredients ?? []) requests.set(ingredient.name, ingredient.type);
  for (const recipe of item.recipes ?? []) {
    for (const ingredient of recipe.ingredients ?? []) requests.set(ingredient.name, ingredient.type);
  }

  if (item.upgradable) {
    for (const quality of ["uncommon", "rare", "epic"]) requests.set(`${item.slug}-${quality}`, item.type);
  }

  return requests;
}

async function fetchItemRecord(slug, typeHint) {
  const direct = await fetchJson(`${API_BASE}/${slug}`);
  if (!direct.error) {
    return {
      ...direct,
      assetType: typeHint ?? direct.type,
      secondaryStats: secondaryStatsForQuality(direct.quality),
    };
  }

  const qualityMatch = slug.match(/-(uncommon|rare|epic)$/);
  if (!qualityMatch) throw new Error(`Item not found: ${slug}`);

  const quality = qualityMatch[1];
  const baseSlug = slug.slice(0, -(quality.length + 1));
  const base = await fetchJson(`${API_BASE}/${baseSlug}`);
  if (base.error) throw new Error(`Item not found: ${slug} (base: ${baseSlug})`);

  return {
    ...base,
    id: `${base.id}-${quality}`,
    documentId: `${base.documentId}-${quality}`,
    slug,
    quality,
    assetType: typeHint ?? base.type,
    baseSlug,
    synthesizedQualityVariant: true,
    secondaryStats: secondaryStatsForQuality(quality),
  };
}

async function main() {
  const root = await fetchItemRecord(rootSlug);
  const relatedRequests = collectRelationRequests(root);
  const records = [root];

  for (const [slug, typeHint] of relatedRequests) {
    await wait(120);
    records.push(await fetchItemRecord(slug, typeHint));
  }

  const media = { items: {}, stats: {}, professions: {} };
  const statTypes = new Set();

  for (const item of records) {
    const asset = itemAsset(item);
    media.items[item.slug] = asset;
    for (const stat of item.stats ?? []) statTypes.add(stat.type);
    for (const token of collectDescriptionTokens(item)) {
      if (descriptionIconTokens.has(token)) statTypes.add(token);
    }
  }

  for (const item of records) {
    const asset = media.items[item.slug];
    const destination = path.join(publicDir, asset.local.replace(/^\//, ""));
    asset.downloaded = await download(asset.remote, destination);
    await wait(80);
  }

  for (const type of statTypes) {
    const remote = `${ASSET_BASE}/stats/${type}.png`;
    const local = `/game-assets/stats/${type}.png`;
    const downloaded = await download(remote, path.join(publicDir, local.replace(/^\//, "")));
    media.stats[type] = { remote, local, downloaded, label: statLabels[type] ?? type.toUpperCase() };
    await wait(80);
  }

  for (const profession of new Set(records.map((item) => item.profession).filter(Boolean))) {
    const remote = `${ASSET_BASE}/professions/${profession}.png`;
    const local = `/game-assets/professions/${profession}.png`;
    const downloaded = await download(remote, path.join(publicDir, local.replace(/^\//, "")));
    media.professions[profession] = { remote, local, downloaded };
    await wait(80);
  }

  const payload = {
    schemaVersion: 1,
    source: {
      page: `${SITE_BASE}/items/${root.type}/${root.slug}?type=${root.type}`,
      api: `${API_BASE}/${root.slug}`,
      assetBase: ASSET_BASE,
      scrapedAt: new Date().toISOString(),
      language: "en",
    },
    rootSlug: root.slug,
    relatedSlugs: [...relatedRequests.keys()],
    records,
    media,
  };

  await mkdir(dataDir, { recursive: true });
  const output = path.join(dataDir, `${root.slug}.json`);
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const downloadedItems = Object.values(media.items).filter((asset) => asset.downloaded).length;
  const downloadedStats = Object.values(media.stats).filter((asset) => asset.downloaded).length;
  console.log(`Saved ${records.length} records to ${output}`);
  console.log(`Downloaded ${downloadedItems} item icons, ${downloadedStats} stat icons and ${Object.keys(media.professions).length} profession icons.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
