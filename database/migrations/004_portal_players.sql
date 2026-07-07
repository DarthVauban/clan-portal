CREATE TABLE IF NOT EXISTS portal_players (
  player_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  discord_nickname TEXT,
  avatar_url TEXT,
  portal_role TEXT NOT NULL DEFAULT 'member' CHECK (portal_role IN ('administrator', 'clan-leader', 'member')),
  application_status TEXT NOT NULL DEFAULT 'pending' CHECK (application_status IN ('pending', 'accepted', 'revoked')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_player_characters (
  character_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES portal_players(player_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_slug TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_players_application_status ON portal_players(application_status, registered_at);
CREATE INDEX IF NOT EXISTS idx_portal_player_characters_player_id ON portal_player_characters(player_id);
