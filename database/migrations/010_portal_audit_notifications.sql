ALTER TABLE portal_resource_requests
  ADD COLUMN IF NOT EXISTS approver_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approver_name TEXT,
  ADD COLUMN IF NOT EXISTS issuer_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issuer_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE portal_craft_requests
  ADD COLUMN IF NOT EXISTS clan_approver_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clan_approver_name TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_player_id TEXT REFERENCES portal_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requester_hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE portal_resource_operations
  ADD COLUMN IF NOT EXISTS collective_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS resource_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS resource_image TEXT,
  ADD COLUMN IF NOT EXISTS actor_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS balance_before INTEGER NOT NULL DEFAULT 0 CHECK (balance_before >= 0),
  ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS portal_notifications (
  notification_id TEXT PRIMARY KEY,
  recipient_player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT '',
  actor_player_id TEXT,
  actor_name TEXT,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_recipient_created ON portal_notifications(recipient_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_recipient_unread ON portal_notifications(recipient_player_id, read_at) WHERE read_at IS NULL;

TRUNCATE TABLE portal_craft_request_requirements, portal_craft_requests, portal_resource_requests;
