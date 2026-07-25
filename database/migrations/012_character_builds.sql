CREATE TABLE IF NOT EXISTS portal_character_builds (
  build_id TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL REFERENCES portal_players(player_id) ON DELETE CASCADE,
  share_slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  hero_class TEXT NOT NULL,
  character_level SMALLINT NOT NULL CHECK (character_level BETWEEN 1 AND 20),
  build_data JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_character_builds_owner_updated
  ON portal_character_builds(owner_player_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_character_builds_public_share
  ON portal_character_builds(share_slug)
  WHERE is_public = TRUE;
