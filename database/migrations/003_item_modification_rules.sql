CREATE TABLE IF NOT EXISTS corepunk_item_modification_rules (
  rule_id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  tier_min INTEGER NOT NULL,
  tier_max INTEGER NOT NULL,
  modification_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  effect_en TEXT NOT NULL,
  effect_ru TEXT NOT NULL,
  CHECK (tier_min <= tier_max),
  UNIQUE (item_type, tier_min, tier_max, modification_type)
);

INSERT INTO corepunk_item_modification_rules
  (rule_id, item_type, tier_min, tier_max, modification_type, source_id, effect_en, effect_ru)
VALUES
  ('implant-t1-t2-upgraded', 'implant', 1, 2, 'upgraded', '-1101', '1 additional secondary stat.', '1 дополнительная вторичная характеристика.'),
  ('implant-t1-t2-overclocked', 'implant', 1, 2, 'overclocked', '-1102', '2 additional secondary stats.', '2 дополнительные вторичные характеристики.'),
  ('weapon-t1-t2-upgraded', 'weapon', 1, 2, 'upgraded', '-1201', '1 additional basic chip slot.', '1 дополнительный слот базового чипа.'),
  ('weapon-t1-t2-overclocked', 'weapon', 1, 2, 'overclocked', '-1202', '2 additional basic chip slots.', '2 дополнительных слота базовых чипов.'),
  ('weapon-t3-upgraded', 'weapon', 3, 3, 'upgraded', '-1301', '1 additional mastery improvement.', '1 дополнительное улучшение мастерства.'),
  ('weapon-t3-overclocked', 'weapon', 3, 3, 'overclocked', '-1302', '2 additional mastery improvements.', '2 дополнительных улучшения мастерства.'),
  ('implant-t3-upgraded', 'implant', 3, 3, 'upgraded', '-1401', '1 additional talent improvement.', '1 дополнительное улучшение таланта.'),
  ('implant-t3-overclocked', 'implant', 3, 3, 'overclocked', '-1402', '2 additional talent improvements.', '2 дополнительных улучшения талантов.')
ON CONFLICT (rule_id) DO UPDATE SET
  item_type = EXCLUDED.item_type,
  tier_min = EXCLUDED.tier_min,
  tier_max = EXCLUDED.tier_max,
  modification_type = EXCLUDED.modification_type,
  source_id = EXCLUDED.source_id,
  effect_en = EXCLUDED.effect_en,
  effect_ru = EXCLUDED.effect_ru;

CREATE INDEX IF NOT EXISTS idx_corepunk_modification_rules_match
  ON corepunk_item_modification_rules (item_type, tier_min, tier_max);
