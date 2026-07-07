CREATE TABLE IF NOT EXISTS portal_resource_requests (
  request_id TEXT PRIMARY KEY,
  resource_slug TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  resource_image TEXT,
  collective_id TEXT NOT NULL,
  collective_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1 CHECK (amount > 0),
  purpose TEXT NOT NULL DEFAULT '',
  requester_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in-progress', 'issued', 'completed', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_craft_requests (
  request_id TEXT PRIMARY KEY,
  item_slug TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_image TEXT,
  recipe_id TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note TEXT NOT NULL DEFAULT '',
  funding TEXT NOT NULL DEFAULT 'personal' CHECK (funding IN ('personal', 'clan')),
  clan_approval_status TEXT NOT NULL DEFAULT 'not-required' CHECK (clan_approval_status IN ('not-required', 'pending', 'approved', 'rejected')),
  requester_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  executor_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  executor_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in-progress', 'issued', 'completed', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_craft_request_requirements (
  request_id TEXT NOT NULL REFERENCES portal_craft_requests(request_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  requirement_slug TEXT NOT NULL,
  requirement_name TEXT NOT NULL,
  requirement_image TEXT,
  requirement_type TEXT NOT NULL DEFAULT 'resource',
  tier INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (request_id, position)
);

CREATE INDEX IF NOT EXISTS idx_portal_resource_requests_status ON portal_resource_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_resource_requests_requester ON portal_resource_requests(requester_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_craft_requests_status ON portal_craft_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_craft_requests_requester ON portal_craft_requests(requester_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_craft_requests_executor ON portal_craft_requests(executor_player_id, created_at DESC);
