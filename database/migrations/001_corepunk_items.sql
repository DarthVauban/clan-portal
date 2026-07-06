CREATE TABLE IF NOT EXISTS corepunk_datasets (
  dataset_key TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  source JSONB NOT NULL,
  counts JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corepunk_items (
  slug TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  source_order INTEGER NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  base_slug TEXT NULL REFERENCES corepunk_items(slug) DEFERRABLE INITIALLY DEFERRED,
  name_en TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  quality TEXT NOT NULL,
  item_type TEXT NOT NULL,
  asset_type TEXT NULL,
  profession TEXT NULL,
  profession_level TEXT NULL,
  item_level INTEGER NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 0,
  upgradable BOOLEAN NOT NULL DEFAULT FALSE,
  description_en TEXT NOT NULL DEFAULT '',
  description_ru TEXT NOT NULL DEFAULT '',
  description_effect_en TEXT NOT NULL DEFAULT '',
  description_effect_ru TEXT NOT NULL DEFAULT '',
  slot TEXT NULL,
  mastery TEXT NULL,
  synthesized_quality_variant BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corepunk_item_ingredients (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  ingredient_slug TEXT NOT NULL,
  ingredient_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (item_slug, position)
);

CREATE TABLE IF NOT EXISTS corepunk_item_recipes (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  PRIMARY KEY (item_slug, recipe_id)
);

CREATE TABLE IF NOT EXISTS corepunk_recipe_ingredients (
  item_slug TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  ingredient_slug TEXT NOT NULL,
  ingredient_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (item_slug, recipe_id, position),
  FOREIGN KEY (item_slug, recipe_id) REFERENCES corepunk_item_recipes(item_slug, recipe_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS corepunk_item_stats (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,
  min_value NUMERIC NOT NULL,
  max_value NUMERIC NOT NULL,
  PRIMARY KEY (item_slug, position)
);

CREATE TABLE IF NOT EXISTS corepunk_item_secondary_stats (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,
  min_value NUMERIC NULL,
  max_value NUMERIC NULL,
  label_en TEXT NOT NULL,
  label_ru TEXT NOT NULL,
  PRIMARY KEY (item_slug, position)
);

CREATE TABLE IF NOT EXISTS corepunk_item_modifications (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  modification_type TEXT NOT NULL,
  effect_en TEXT NOT NULL,
  effect_ru TEXT NOT NULL,
  PRIMARY KEY (item_slug, position)
);

CREATE TABLE IF NOT EXISTS corepunk_item_tags (
  item_slug TEXT NOT NULL REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  PRIMARY KEY (item_slug, position)
);

CREATE TABLE IF NOT EXISTS corepunk_item_special_effects (
  item_slug TEXT PRIMARY KEY REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  description_effect_en TEXT NOT NULL,
  description_effect_ru TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corepunk_item_prices (
  item_slug TEXT PRIMARY KEY REFERENCES corepunk_items(slug) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  price_type TEXT NOT NULL,
  amount TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corepunk_media_assets (
  asset_category TEXT NOT NULL CHECK (asset_category IN ('item', 'stat', 'profession')),
  asset_key TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  label_en TEXT NULL,
  label_ru TEXT NULL,
  asset_type TEXT NULL,
  PRIMARY KEY (asset_category, asset_key)
);

CREATE TABLE IF NOT EXISTS corepunk_relation_targets (
  requested_slug TEXT PRIMARY KEY,
  requested_type TEXT NOT NULL,
  target_slug TEXT NULL,
  route_slug TEXT NULL,
  href TEXT NULL,
  preview_slug TEXT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS corepunk_relation_edges (
  edge_id BIGSERIAL PRIMARY KEY,
  source_slug TEXT NOT NULL,
  source_type TEXT NOT NULL,
  relation_kind TEXT NOT NULL,
  requested_slug TEXT NOT NULL,
  requested_type TEXT NOT NULL,
  target_slug TEXT NULL,
  route_slug TEXT NULL,
  href TEXT NULL,
  preview_slug TEXT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INTEGER NOT NULL DEFAULT 0,
  recipe_id TEXT NULL,
  recipe_name TEXT NULL
);
