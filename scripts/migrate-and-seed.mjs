import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();
const migrationsDirectory = path.join(root, "database", "migrations");
const itemsPath = path.join(root, "src", "data", "corepunk-items.json");
const localizationPath = path.join(root, "src", "data", "corepunk-items-ru.json");
const glossaryPath = path.join(root, "src", "localization", "corepunk-glossary.json");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required to migrate the database.");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function connectWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function applyMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const filenames = (await readdir(migrationsDirectory)).filter((filename) => filename.endsWith(".sql")).sort();
  for (const filename of filenames) {
    const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const checksum = sha256(sql);
    const existing = await client.query("SELECT checksum FROM schema_migrations WHERE filename = $1", [filename]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migration ${filename} was changed after it had been applied.`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [filename, checksum]);
      await client.query("COMMIT");
      console.log(`[database] applied migration ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function insertJsonRows(client, table, columns, definitions, rows) {
  if (rows.length === 0) return;
  const columnList = columns.join(", ");
  const selection = columns.map((column) => `data.${column}`).join(", ");
  await client.query(
    `INSERT INTO ${table} (${columnList}) SELECT ${selection} FROM jsonb_to_recordset($1::jsonb) AS data(${definitions})`,
    [JSON.stringify(rows)],
  );
}

async function seedCorepunkItems(client) {
  const [itemsRaw, localizationRaw, glossaryRaw] = await Promise.all([
    readFile(itemsPath, "utf8"),
    readFile(localizationPath, "utf8"),
    readFile(glossaryPath, "utf8"),
  ]);
  const contentHash = sha256(`${itemsRaw}\n${localizationRaw}\n${glossaryRaw}`);
  const current = await client.query("SELECT content_hash FROM corepunk_datasets WHERE dataset_key = 'corepunk-items'");
  if (current.rows[0]?.content_hash === contentHash) {
    console.log("[database] Corepunk item dataset is up to date");
    return;
  }

  const database = JSON.parse(itemsRaw);
  const localization = JSON.parse(localizationRaw);
  const glossary = JSON.parse(glossaryRaw);
  const exactTerms = new Map((glossary.entries ?? []).map((entry) => [entry.source.toLocaleLowerCase("en"), entry.target]));
  const translate = (value) => {
    if (!value) return value ?? "";
    return localization.translations?.[value] ?? exactTerms.get(value.toLocaleLowerCase("en")) ?? value;
  };
  const baseSlugs = new Set(database.baseSlugs);

  const items = database.records.map((item, sourceOrder) => ({
    slug: item.slug,
    source_id: String(item.id ?? ""),
    document_id: item.documentId ?? "",
    source_order: sourceOrder,
    is_base: baseSlugs.has(item.slug),
    base_slug: item.baseSlug ?? null,
    name_en: item.englishName ?? item.name,
    name_ru: translate(item.englishName ?? item.name),
    quality: item.quality ?? "common",
    item_type: item.type ?? "",
    asset_type: item.assetType ?? null,
    profession: item.profession ?? null,
    profession_level: item.professionLevel ?? null,
    item_level: item.level ?? 0,
    tier: item.tier ?? 0,
    upgradable: Boolean(item.upgradable),
    description_en: item.description ?? "",
    description_ru: translate(item.description),
    description_effect_en: item.descriptionEffect ?? "",
    description_effect_ru: translate(item.descriptionEffect),
    slot: item.slot ?? null,
    mastery: item.mastery ?? null,
    synthesized_quality_variant: Boolean(item.synthesizedQualityVariant),
    raw_data: item,
  }));

  const ingredients = database.records.flatMap((item) => (item.ingredients ?? []).map((ingredient, position) => ({
    item_slug: item.slug,
    position,
    source_id: String(ingredient.id ?? ""),
    ingredient_slug: ingredient.name,
    ingredient_type: ingredient.type,
    quantity: ingredient.quantity ?? 0,
  })));
  const recipes = database.records.flatMap((item) => (item.recipes ?? []).map((recipe, position) => ({
    item_slug: item.slug,
    recipe_id: String(recipe.id),
    position,
    name_en: recipe.name ?? "",
    name_ru: translate(recipe.name),
  })));
  const recipeIngredients = database.records.flatMap((item) => (item.recipes ?? []).flatMap((recipe) => (recipe.ingredients ?? []).map((ingredient, position) => ({
    item_slug: item.slug,
    recipe_id: String(recipe.id),
    position,
    source_id: String(ingredient.id ?? ""),
    ingredient_slug: ingredient.name,
    ingredient_type: ingredient.type,
    quantity: ingredient.quantity ?? 0,
  }))));
  const stats = database.records.flatMap((item) => (item.stats ?? []).map((stat, position) => ({
    item_slug: item.slug,
    position,
    source_id: String(stat.id ?? ""),
    stat_type: stat.type,
    min_value: stat.min ?? 0,
    max_value: stat.max ?? 0,
  })));
  const secondaryStats = database.records.flatMap((item) => (item.secondaryStats ?? []).map((stat, position) => ({
    item_slug: item.slug,
    position,
    source_id: String(stat.id ?? ""),
    stat_type: stat.type,
    min_value: stat.min ?? null,
    max_value: stat.max ?? null,
    label_en: stat.label ?? "",
    label_ru: translate(stat.label),
  })));
  const modifications = database.records.flatMap((item) => (item.modifications ?? []).map((modification, position) => ({
    item_slug: item.slug,
    position,
    source_id: String(modification.id ?? ""),
    modification_type: modification.type ?? "",
    effect_en: modification.effect ?? "",
    effect_ru: translate(modification.effect),
  })));
  const tags = database.records.flatMap((item) => (item.tags ?? []).map((tag, position) => ({
    item_slug: item.slug,
    position,
    source_id: String(tag.id ?? ""),
    tag_name: tag.name ?? "",
  })));
  const specialEffects = database.records.flatMap((item) => item.specialEffect ? [{
    item_slug: item.slug,
    source_id: String(item.specialEffect.id ?? ""),
    title_en: item.specialEffect.title ?? "",
    title_ru: translate(item.specialEffect.title),
    description_effect_en: item.specialEffect.descriptionEffect ?? "",
    description_effect_ru: translate(item.specialEffect.descriptionEffect),
  }] : []);
  const prices = database.records.flatMap((item) => item.price ? [{
    item_slug: item.slug,
    source_id: String(item.price.id ?? ""),
    price_type: item.price.type ?? "",
    amount: String(item.price.amount ?? ""),
  }] : []);
  const media = Object.entries(database.media ?? {}).flatMap(([category, assets]) => Object.entries(assets ?? {}).map(([key, asset]) => ({
    asset_category: category === "items" ? "item" : category === "stats" ? "stat" : "profession",
    asset_key: key,
    remote_url: asset.remote ?? "",
    local_path: asset.local ?? "",
    downloaded: Boolean(asset.downloaded),
    cached: Boolean(asset.cached),
    label_en: asset.label ?? null,
    label_ru: asset.label ? translate(asset.label) : null,
    asset_type: asset.assetType ?? null,
  })));
  const relationTargets = Object.values(database.relations?.targets ?? {}).map((target) => ({
    requested_slug: target.requestedSlug,
    requested_type: target.requestedType ?? "",
    target_slug: target.targetSlug ?? null,
    route_slug: target.routeSlug ?? null,
    href: target.href ?? null,
    preview_slug: target.previewSlug ?? null,
    resolved: Boolean(target.resolved),
  }));
  const relationEdges = (database.relations?.edges ?? []).map((edge) => ({
    source_slug: edge.sourceSlug,
    source_type: edge.sourceType ?? "",
    relation_kind: edge.kind ?? "",
    requested_slug: edge.requestedSlug,
    requested_type: edge.requestedType ?? "",
    target_slug: edge.targetSlug ?? null,
    route_slug: edge.routeSlug ?? null,
    href: edge.href ?? null,
    preview_slug: edge.previewSlug ?? null,
    resolved: Boolean(edge.resolved),
    quantity: edge.quantity ?? 0,
    recipe_id: edge.recipeId == null ? null : String(edge.recipeId),
    recipe_name: edge.recipeName ?? null,
  }));

  await client.query("BEGIN");
  try {
    await client.query("TRUNCATE corepunk_datasets, corepunk_items, corepunk_media_assets, corepunk_relation_targets, corepunk_relation_edges RESTART IDENTITY CASCADE");
    await insertJsonRows(client, "corepunk_items", ["slug", "source_id", "document_id", "source_order", "is_base", "base_slug", "name_en", "name_ru", "quality", "item_type", "asset_type", "profession", "profession_level", "item_level", "tier", "upgradable", "description_en", "description_ru", "description_effect_en", "description_effect_ru", "slot", "mastery", "synthesized_quality_variant", "raw_data"], "slug text, source_id text, document_id text, source_order integer, is_base boolean, base_slug text, name_en text, name_ru text, quality text, item_type text, asset_type text, profession text, profession_level text, item_level integer, tier integer, upgradable boolean, description_en text, description_ru text, description_effect_en text, description_effect_ru text, slot text, mastery text, synthesized_quality_variant boolean, raw_data jsonb", items);
    await insertJsonRows(client, "corepunk_item_ingredients", ["item_slug", "position", "source_id", "ingredient_slug", "ingredient_type", "quantity"], "item_slug text, position integer, source_id text, ingredient_slug text, ingredient_type text, quantity integer", ingredients);
    await insertJsonRows(client, "corepunk_item_recipes", ["item_slug", "recipe_id", "position", "name_en", "name_ru"], "item_slug text, recipe_id text, position integer, name_en text, name_ru text", recipes);
    await insertJsonRows(client, "corepunk_recipe_ingredients", ["item_slug", "recipe_id", "position", "source_id", "ingredient_slug", "ingredient_type", "quantity"], "item_slug text, recipe_id text, position integer, source_id text, ingredient_slug text, ingredient_type text, quantity integer", recipeIngredients);
    await insertJsonRows(client, "corepunk_item_stats", ["item_slug", "position", "source_id", "stat_type", "min_value", "max_value"], "item_slug text, position integer, source_id text, stat_type text, min_value numeric, max_value numeric", stats);
    await insertJsonRows(client, "corepunk_item_secondary_stats", ["item_slug", "position", "source_id", "stat_type", "min_value", "max_value", "label_en", "label_ru"], "item_slug text, position integer, source_id text, stat_type text, min_value numeric, max_value numeric, label_en text, label_ru text", secondaryStats);
    await insertJsonRows(client, "corepunk_item_modifications", ["item_slug", "position", "source_id", "modification_type", "effect_en", "effect_ru"], "item_slug text, position integer, source_id text, modification_type text, effect_en text, effect_ru text", modifications);
    await insertJsonRows(client, "corepunk_item_tags", ["item_slug", "position", "source_id", "tag_name"], "item_slug text, position integer, source_id text, tag_name text", tags);
    await insertJsonRows(client, "corepunk_item_special_effects", ["item_slug", "source_id", "title_en", "title_ru", "description_effect_en", "description_effect_ru"], "item_slug text, source_id text, title_en text, title_ru text, description_effect_en text, description_effect_ru text", specialEffects);
    await insertJsonRows(client, "corepunk_item_prices", ["item_slug", "source_id", "price_type", "amount"], "item_slug text, source_id text, price_type text, amount text", prices);
    await insertJsonRows(client, "corepunk_media_assets", ["asset_category", "asset_key", "remote_url", "local_path", "downloaded", "cached", "label_en", "label_ru", "asset_type"], "asset_category text, asset_key text, remote_url text, local_path text, downloaded boolean, cached boolean, label_en text, label_ru text, asset_type text", media);
    await insertJsonRows(client, "corepunk_relation_targets", ["requested_slug", "requested_type", "target_slug", "route_slug", "href", "preview_slug", "resolved"], "requested_slug text, requested_type text, target_slug text, route_slug text, href text, preview_slug text, resolved boolean", relationTargets);
    await insertJsonRows(client, "corepunk_relation_edges", ["source_slug", "source_type", "relation_kind", "requested_slug", "requested_type", "target_slug", "route_slug", "href", "preview_slug", "resolved", "quantity", "recipe_id", "recipe_name"], "source_slug text, source_type text, relation_kind text, requested_slug text, requested_type text, target_slug text, route_slug text, href text, preview_slug text, resolved boolean, quantity integer, recipe_id text, recipe_name text", relationEdges);
    await client.query(
      "INSERT INTO corepunk_datasets (dataset_key, schema_version, source, counts, content_hash) VALUES ('corepunk-items', $1, $2::jsonb, $3::jsonb, $4)",
      [database.schemaVersion, JSON.stringify(database.source), JSON.stringify(database.counts), contentHash],
    );
    await client.query("COMMIT");
    console.log(`[database] imported ${items.length} item records, ${ingredients.length + recipeIngredients.length} ingredient rows and ${media.length} media assets`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

const client = await connectWithRetry();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('clan-portal-database-startup'))");
  await applyMigrations(client);
  await seedCorepunkItems(client);
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('clan-portal-database-startup'))").catch(() => undefined);
  await client.end();
}
