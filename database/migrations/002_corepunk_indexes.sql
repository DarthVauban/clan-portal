CREATE INDEX IF NOT EXISTS idx_corepunk_items_base ON corepunk_items (is_base, source_order);
CREATE INDEX IF NOT EXISTS idx_corepunk_items_type_tier ON corepunk_items (item_type, tier);
CREATE INDEX IF NOT EXISTS idx_corepunk_items_quality ON corepunk_items (quality);
CREATE INDEX IF NOT EXISTS idx_corepunk_items_profession ON corepunk_items (profession) WHERE profession IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corepunk_items_base_slug ON corepunk_items (base_slug) WHERE base_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corepunk_items_name_ru_search ON corepunk_items (LOWER(name_ru));
CREATE INDEX IF NOT EXISTS idx_corepunk_items_name_en_search ON corepunk_items (LOWER(name_en));
CREATE INDEX IF NOT EXISTS idx_corepunk_item_ingredients_slug ON corepunk_item_ingredients (ingredient_slug);
CREATE INDEX IF NOT EXISTS idx_corepunk_recipe_ingredients_slug ON corepunk_recipe_ingredients (ingredient_slug);
CREATE INDEX IF NOT EXISTS idx_corepunk_relation_edges_source ON corepunk_relation_edges (source_slug);
CREATE INDEX IF NOT EXISTS idx_corepunk_relation_edges_target ON corepunk_relation_edges (target_slug) WHERE target_slug IS NOT NULL;

CREATE OR REPLACE VIEW corepunk_item_catalog AS
SELECT
  item.slug,
  item.name_ru AS name,
  item.name_en AS english_name,
  item.item_type,
  item.quality,
  item.tier,
  item.item_level,
  item.profession,
  item.mastery,
  item.upgradable,
  media.local_path AS image
FROM corepunk_items item
LEFT JOIN corepunk_media_assets media
  ON media.asset_category = 'item' AND media.asset_key = item.slug
WHERE item.is_base = TRUE;
