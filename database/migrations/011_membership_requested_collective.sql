ALTER TABLE portal_players
  ADD COLUMN IF NOT EXISTS requested_collective_id TEXT REFERENCES portal_collectives(collective_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_players_requested_collective
  ON portal_players(requested_collective_id)
  WHERE requested_collective_id IS NOT NULL;
