ALTER TABLE portal_players DROP CONSTRAINT IF EXISTS portal_players_application_status_check;

ALTER TABLE portal_players
  ADD CONSTRAINT portal_players_application_status_check
  CHECK (application_status IN ('pending', 'accepted', 'revoked', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_portal_players_blocked ON portal_players(application_status, updated_at)
  WHERE application_status = 'blocked';
