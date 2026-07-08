CREATE TABLE IF NOT EXISTS portal_resource_balances (
  collective_id TEXT NOT NULL REFERENCES portal_collectives(collective_id) DEFERRABLE INITIALLY DEFERRED,
  resource_slug TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collective_id, resource_slug)
);

CREATE TABLE IF NOT EXISTS portal_resource_operations (
  operation_id TEXT PRIMARY KEY,
  collective_id TEXT NOT NULL REFERENCES portal_collectives(collective_id) DEFERRABLE INITIALLY DEFERRED,
  resource_slug TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  actor_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_resource_balances_collective ON portal_resource_balances(collective_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_resource_operations_collective ON portal_resource_operations(collective_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_resource_operations_created ON portal_resource_operations(created_at DESC);
