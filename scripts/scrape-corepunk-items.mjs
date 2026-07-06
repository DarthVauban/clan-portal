import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_BASE = "https://corepunk.help";
const API_BASE = `${SITE_BASE}/api/items`;
const ASSET_BASE = "https://d2fwno52vggyhx.cloudfront.net";
const ALLOWED_TYPES = ["weapon", "implant", "chip", "rune", "consumable", "resource"];
const QUALITY_ORDER = ["common", "uncommon", "rare", "epic"];
const PAGE_SIZE = 999;
const API_CONCURRENCY = 4;
const ASSET_CONCURRENCY = 6;
const USER_AGENT = "ClanPortalItemImporter/1.0 (+private Corepunk clan knowledge base)";
const refresh = process.argv.includes("--refresh");

const statLabels = {
  abilitysteal: "Ability Steal",
  ap: "Attack Power",
  armor: "Armor",
  as: "Attack Speed",
  bleed: "Bleed Chance",
  cast: "Haste",
  ccres: "Tenacity",
  cd: "Cooldown Reduction",
  corruption: "Corruption Chance",
  costred: "Cost Reduction",
  fmpen: "Flat Magical Penetration",
  fppen: "Flat Physical Penetration",
  hasp: "Heal and Shield Power",
  haspincrease: "Heal/Shield Increase",
  health: "Health",
  hregen: "Health Regeneration",
  increase: "Outgoing Damage Increase",
  lifesteal: "Lifesteal",
  madr: "Main Attack Damage Reduction",
  mana: "Mana",
  mcc: "Magical Crit Chance",
  mcp: "Magical Crit Power",
  mdecrease: "Magical Damage Decrease",
  mdr: "Magic Damage Reduction",
  mpen: "Magical Penetration",
  mr: "Magic Resistance",
  mregen: "Mana Regeneration",
  ms: "Movement Speed",
  pcc: "Physical Crit Chance",
  pcp: "Physical Crit Power",
  pdecrease: "Physical Damage Decrease",
  ppen: "Physical Penetration",
  sbc: "Shield Block Chance",
  sbp: "Shield Block Power",
  slowres: "Slow Resistance",
  sp: "Spell Power",
  vr: "Vision Range",
  wd: "Weapon Damage",
};

const projectRoot = path.resolve();
const publicDir = path.join(projectRoot, "public");
const dataDir = path.join(projectRoot, "src", "data");
const cacheDir = path.join(projectRoot, "scripts", ".cache", "corepunk-items");
const outputPath = path.join(dataDir, "corepunk-items.json");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function secondaryStatsForItem(item, quality) {
  if (item.type !== "implant") return [];
  const slots = { common: 0, uncommon: 1, rare: 2, epic: 3 }[quality] ?? 0;
  return Array.from({ length: slots }, (_, index) => ({
    id: `random-secondary-${index + 1}`,
    type: "random",
    min: null,
    max: null,
    label: "Random secondary stat",
  }));
}

async function fetchWithRetry(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
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

function catalogFilters() {
  return {
    profession: "",
    mastery: "",
    type: ALLOWED_TYPES.join(","),
    tier: "",
    quality: "",
    tags: [],
    name: "",
    sort: "name:asc",
  };
}

async function fetchCatalog() {
  const params = new URLSearchParams({
    page: "1",
    size: String(PAGE_SIZE),
    filters: JSON.stringify(catalogFilters()),
  });
  const result = await fetchJson(`${API_BASE}/by-category?${params}`);
  const rows = (result.data ?? []).filter((item) => ALLOWED_TYPES.includes(item.type));

  if (result.meta?.pagination?.pageCount > 1) {
    throw new Error(`Unexpected pagination: ${result.meta.pagination.pageCount} pages`);
  }

  return { rows, pagination: result.meta?.pagination ?? null };
}

function completenessScore(item) {
  return JSON.stringify(item).length;
}

function deduplicateCatalog(rows) {
  const bySlug = new Map();
  const duplicates = [];

  for (const item of rows) {
    const existing = bySlug.get(item.slug);
    if (!existing) {
      bySlug.set(item.slug, item);
      continue;
    }

    duplicates.push({ slug: item.slug, keptId: existing.id, duplicateId: item.id });
    if (completenessScore(item) > completenessScore(existing)) bySlug.set(item.slug, item);
  }

  return { items: [...bySlug.values()], duplicates };
}

async function readCachedItem(slug) {
  if (refresh) return null;
  try {
    return JSON.parse(await readFile(path.join(cacheDir, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function fetchDetailedItems(items) {
  await mkdir(cacheDir, { recursive: true });
  let completed = 0;

  return mapLimit(items, API_CONCURRENCY, async (catalogItem) => {
    const cached = await readCachedItem(catalogItem.slug);
    let detail = cached;

    if (!detail) {
      const result = await fetchJson(`${API_BASE}/${catalogItem.slug}`);
      detail = result?.error ? catalogItem : result;
      await writeFile(path.join(cacheDir, `${catalogItem.slug}.json`), `${JSON.stringify(detail, null, 2)}\n`, "utf8");
      await wait(90);
    }

    completed += 1;
    if (completed % 25 === 0 || completed === items.length) {
      console.log(`[data] ${completed}/${items.length} item records`);
    }

    return {
      ...catalogItem,
      ...detail,
      ingredients: detail.ingredients ?? catalogItem.ingredients ?? [],
      recipes: detail.recipes ?? [],
      stats: detail.stats ?? catalogItem.stats ?? [],
      tags: detail.tags ?? catalogItem.tags ?? [],
      modifications: detail.modifications ?? catalogItem.modifications ?? [],
      secondaryStats: secondaryStatsForItem(detail, detail.quality),
    };
  });
}

function synthesizeQualityVariants(items) {
  const records = [];

  for (const item of items) {
    records.push(item);
    if (!item.upgradable) continue;

    for (const quality of QUALITY_ORDER.slice(1)) {
      records.push({
        ...item,
        id: `${item.id}-${quality}`,
        documentId: `${item.documentId}-${quality}`,
        slug: `${item.slug}-${quality}`,
        quality,
        baseSlug: item.slug,
        synthesizedQualityVariant: true,
        secondaryStats: secondaryStatsForItem(item, quality),
      });
    }
  }

  return records;
}

function collectTypeHints(items) {
  const hints = new Map();
  const add = (slug, type) => {
    if (!slug || !type) return;
    if (!hints.has(slug)) hints.set(slug, new Set());
    hints.get(slug).add(type);
  };

  for (const item of items) {
    add(item.slug, item.type);
    for (const ingredient of item.ingredients ?? []) add(ingredient.name, ingredient.type);
    for (const recipe of item.recipes ?? []) {
      for (const ingredient of recipe.ingredients ?? []) add(ingredient.name, ingredient.type);
    }
  }

  return hints;
}

function collectTokens(value, target = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\[([a-z][a-z0-9_-]*)\]/gi)) target.add(match[1].toLowerCase());
    return target;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectTokens(entry, target);
    return target;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectTokens(entry, target);
  }

  return target;
}

async function downloadTo(url, destination) {
  if (await fileExists(destination)) return { downloaded: true, cached: true };
  const response = await fetchWithRetry(url, { maxAttempts: 3 }).catch(() => null);
  if (!response?.ok) return { downloaded: false, cached: false };
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return { downloaded: true, cached: false };
}

async function downloadItemAssets(records, typeHints) {
  const media = {};
  let completed = 0;

  await mapLimit(records, ASSET_CONCURRENCY, async (item) => {
    const baseSlug = item.baseSlug ?? item.slug;
    const candidates = [...new Set([
      item.assetType,
      item.type,
      ...(typeHints.get(item.slug) ?? []),
      ...(typeHints.get(baseSlug) ?? []),
    ].filter(Boolean))];
    const local = `/game-assets/items/${item.type}/${item.slug}.png`;
    const destination = path.join(publicDir, local.replace(/^\//, ""));
    let result = { downloaded: false, cached: false };
    let remote = `${ASSET_BASE}/items/${item.type}/${item.slug}.png`;
    let assetType = item.type;

    for (const candidate of candidates) {
      remote = `${ASSET_BASE}/items/${candidate}/${item.slug}.png`;
      assetType = candidate;
      result = await downloadTo(remote, destination);
      if (result.downloaded) break;
    }

    media[item.slug] = { remote, local, assetType, ...result };
    completed += 1;
    if (completed % 100 === 0 || completed === records.length) {
      console.log(`[images] ${completed}/${records.length} item icons`);
    }
    await wait(35);
  });

  return media;
}

async function downloadNamedAssets(names, folder) {
  const media = {};
  const sortedNames = [...names].sort();

  await mapLimit(sortedNames, ASSET_CONCURRENCY, async (name) => {
    const remote = `${ASSET_BASE}/${folder}/${name}.png`;
    const local = `/game-assets/${folder}/${name}.png`;
    const result = await downloadTo(remote, path.join(publicDir, local.replace(/^\//, "")));
    media[name] = { remote, local, ...result };
    await wait(35);
  });

  return media;
}

function relationTarget(requestedSlug, requestedType, recordsBySlug, baseBySlug) {
  const exact = recordsBySlug.get(requestedSlug);
  let target = exact;

  if (!target) {
    const match = requestedSlug.match(/-(uncommon|rare|epic)$/);
    if (match) target = baseBySlug.get(requestedSlug.slice(0, -(match[1].length + 1)));
  }

  const routeSlug = target?.baseSlug ?? target?.slug ?? null;
  return {
    requestedSlug,
    requestedType,
    targetSlug: target?.slug ?? null,
    routeSlug,
    href: routeSlug ? `/items/${routeSlug}` : null,
    previewSlug: target?.slug ?? null,
    resolved: Boolean(target),
  };
}

function buildRelations(items, records) {
  const recordsBySlug = new Map(records.map((item) => [item.slug, item]));
  const baseBySlug = new Map(items.map((item) => [item.slug, item]));
  const targets = {};
  const edges = [];

  const append = (owner, ingredient, kind, recipe = null) => {
    const target = relationTarget(ingredient.name, ingredient.type, recordsBySlug, baseBySlug);
    targets[ingredient.name] = target;
    edges.push({
      sourceSlug: owner.slug,
      sourceType: owner.type,
      kind,
      recipeId: recipe?.id ?? null,
      recipeName: recipe?.name ?? null,
      quantity: ingredient.quantity,
      ...target,
    });
  };

  for (const item of items) {
    for (const ingredient of item.ingredients ?? []) append(item, ingredient, "workbench");
    for (const recipe of item.recipes ?? []) {
      for (const ingredient of recipe.ingredients ?? []) append(item, ingredient, "synthesis", recipe);
    }
  }

  return { targets, edges };
}

function typeCounts(items) {
  return Object.fromEntries(ALLOWED_TYPES.map((type) => [type, items.filter((item) => item.type === type).length]));
}

async function main() {
  console.log(`[catalog] ${SITE_BASE}/items?type=${ALLOWED_TYPES.join(",")}`);
  const { rows, pagination } = await fetchCatalog();
  const { items: catalogItems, duplicates } = deduplicateCatalog(rows);
  console.log(`[catalog] ${rows.length} source rows, ${catalogItems.length} unique slugs`);

  const items = await fetchDetailedItems(catalogItems);
  const records = synthesizeQualityVariants(items);
  const typeHints = collectTypeHints(items);
  const tokenNames = collectTokens(items);
  for (const item of items) for (const stat of item.stats ?? []) tokenNames.add(stat.type);
  for (const item of items) for (const tag of item.tags ?? []) tokenNames.add(tag.name);
  const professionNames = new Set(items.map((item) => item.profession).filter(Boolean));

  const itemMedia = await downloadItemAssets(records, typeHints);
  const statMedia = await downloadNamedAssets(tokenNames, "stats");
  for (const [name, asset] of Object.entries(statMedia)) asset.label = statLabels[name] ?? name;
  const professionMedia = await downloadNamedAssets(professionNames, "professions");
  const relations = buildRelations(items, records);

  const unresolved = Object.values(relations.targets).filter((target) => !target.resolved);
  const downloadedItemIcons = Object.values(itemMedia).filter((asset) => asset.downloaded).length;
  const downloadedStatIcons = Object.values(statMedia).filter((asset) => asset.downloaded).length;

  const payload = {
    schemaVersion: 2,
    source: {
      page: `${SITE_BASE}/items?type=${ALLOWED_TYPES.join(",")}`,
      api: `${API_BASE}/by-category`,
      assetBase: ASSET_BASE,
      scrapedAt: new Date().toISOString(),
      language: "en",
      allowedTypes: ALLOWED_TYPES,
      filters: catalogFilters(),
      pagination,
    },
    counts: {
      sourceRows: rows.length,
      uniqueBaseItems: items.length,
      duplicateRows: duplicates.length,
      synthesizedQualityVariants: records.length - items.length,
      totalRecords: records.length,
      itemIcons: downloadedItemIcons,
      statIcons: downloadedStatIcons,
      professions: Object.keys(professionMedia).length,
      relationEdges: relations.edges.length,
      unresolvedRelationTargets: unresolved.length,
      byType: typeCounts(items),
    },
    duplicateRows: duplicates,
    baseSlugs: items.map((item) => item.slug),
    records,
    relations,
    media: {
      items: itemMedia,
      stats: statMedia,
      professions: professionMedia,
    },
  };

  await mkdir(dataDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`[done] ${outputPath}`);
  console.log(`[done] ${downloadedItemIcons}/${records.length} item icons, ${downloadedStatIcons}/${tokenNames.size} stat icons`);
  console.log(`[done] ${relations.edges.length} recipe edges, ${unresolved.length} unresolved targets`);
  if (unresolved.length) console.log(`[unresolved] ${unresolved.map((target) => target.requestedSlug).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
