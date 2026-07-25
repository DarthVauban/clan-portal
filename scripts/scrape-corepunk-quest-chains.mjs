import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE = "https://corepunk.help";
const CHAINS_API = `${SITE_BASE}/api/quests/chains`;
const CATALOG_API = `${SITE_BASE}/api/quests`;
const REWARD_STATS_API = `${SITE_BASE}/api/quests/reward-stats`;
const OUTPUT_PATH = path.resolve("src", "data", "corepunk-quest-chains.json");
const USER_AGENT = "ClanPortalQuestImporter/1.0 (+local portal data import)";
const CONCURRENCY = 4;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
      if (response.ok) return response;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 750);
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await wait(attempt * 750);
    }
  }

  throw new Error(`Request failed: ${url}`);
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  return response.json();
}

async function fetchOptionalJson(url) {
  try {
    const value = await fetchJson(url);
    return value && !value.error ? value : null;
  } catch (error) {
    console.warn(`[skip] ${url}: ${error.message}`);
    return null;
  }
}

async function mapLimit(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function flattenChainTree(node, records = new Map()) {
  if (!records.has(node.slug)) {
    records.set(node.slug, {
      slug: node.slug,
      name: node.name,
      level: node.level,
      questGiver: node.questGiver,
      location: node.location,
      isShared: Boolean(node.isShared),
    });
  }
  for (const child of node.children ?? []) flattenChainTree(child, records);
  return records;
}

function collectRelatedSlugs(quests) {
  const npcSlugs = new Set();
  const itemSlugs = new Set();

  for (const quest of quests) {
    if (quest.questGiver) npcSlugs.add(quest.questGiver);
    if (quest.questFinisher) npcSlugs.add(quest.questFinisher);

    for (const goal of quest.goals ?? []) {
      if (goal.item?.slug) itemSlugs.add(goal.item.slug);
      if (goal.target?.slug) npcSlugs.add(goal.target.slug);
    }

    for (const item of quest.rewards?.items ?? []) {
      if (item.item) itemSlugs.add(item.item);
    }
    for (const group of quest.rewards?.itemGroups ?? []) {
      for (const item of group.items ?? []) {
        if (item.item) itemSlugs.add(item.item);
      }
    }
  }

  return { npcSlugs: [...npcSlugs].sort(), itemSlugs: [...itemSlugs].sort() };
}

async function main() {
  console.log(`[chains] ${CHAINS_API}`);
  const [chainPayload, catalogPayload, rewardStats] = await Promise.all([
    fetchJson(CHAINS_API),
    fetchJson(`${CATALOG_API}?page=1&pageSize=999&sort=level%3Aasc`),
    fetchJson(REWARD_STATS_API),
  ]);
  const summaries = new Map();
  for (const chain of chainPayload.chains ?? []) flattenChainTree(chain.tree, summaries);

  const questSlugs = [...new Set([
    ...(catalogPayload.data ?? []).map((quest) => quest.slug),
    ...summaries.keys(),
  ])];
  let completedQuests = 0;
  const quests = await mapLimit(questSlugs, CONCURRENCY, async (slug) => {
    const quest = await fetchJson(`${SITE_BASE}/api/quests/${slug}`);
    completedQuests += 1;
    if (completedQuests % 20 === 0 || completedQuests === questSlugs.length) {
      console.log(`[quests] ${completedQuests}/${questSlugs.length}`);
    }
    await wait(45);
    return quest;
  });

  const { npcSlugs, itemSlugs } = collectRelatedSlugs(quests);
  let completedRelations = 0;
  const relationTotal = npcSlugs.length + itemSlugs.length;
  const npcRecords = await mapLimit(npcSlugs, CONCURRENCY, async (slug) => {
    const value = await fetchOptionalJson(`${SITE_BASE}/api/npcs/${slug}`);
    completedRelations += 1;
    if (completedRelations % 25 === 0 || completedRelations === relationTotal) {
      console.log(`[relations] ${completedRelations}/${relationTotal}`);
    }
    await wait(35);
    return [slug, value];
  });
  const itemRecords = await mapLimit(itemSlugs, CONCURRENCY, async (slug) => {
    const value = await fetchOptionalJson(`${SITE_BASE}/api/items/${slug}`);
    completedRelations += 1;
    if (completedRelations % 25 === 0 || completedRelations === relationTotal) {
      console.log(`[relations] ${completedRelations}/${relationTotal}`);
    }
    await wait(35);
    return [slug, value];
  });

  const npcs = Object.fromEntries(npcRecords.filter(([, value]) => value));
  const items = Object.fromEntries(itemRecords.filter(([, value]) => value));
  const unresolvedNpcs = npcRecords.filter(([, value]) => !value).map(([slug]) => slug);
  const unresolvedItems = itemRecords.filter(([, value]) => !value).map(([slug]) => slug);
  const payload = {
    schemaVersion: 1,
    source: {
      page: `${SITE_BASE}/quests`,
      chainsApi: CHAINS_API,
      catalogApi: CATALOG_API,
      questApi: `${SITE_BASE}/api/quests/{slug}`,
      rewardStatsApi: REWARD_STATS_API,
      npcApi: `${SITE_BASE}/api/npcs/{slug}`,
      itemApi: `${SITE_BASE}/api/items/{slug}`,
      scrapedAt: new Date().toISOString(),
      language: "en",
    },
    counts: {
      chains: chainPayload.chains.length,
      quests: quests.length,
      npcs: Object.keys(npcs).length,
      items: Object.keys(items).length,
      unresolvedNpcs: unresolvedNpcs.length,
      unresolvedItems: unresolvedItems.length,
    },
    meta: {
      chains: chainPayload.meta ?? null,
      catalog: catalogPayload.meta ?? null,
    },
    chains: chainPayload.chains,
    quests,
    rewardStats,
    npcs,
    items,
    unresolved: {
      npcs: unresolvedNpcs,
      items: unresolvedItems,
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[done] ${OUTPUT_PATH}`);
  console.log(`[done] ${payload.counts.chains} chains, ${payload.counts.quests} quests, ${payload.counts.npcs} NPCs, ${payload.counts.items} items`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
