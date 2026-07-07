CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO portal_settings (setting_key, setting_value)
VALUES ('portal_name', 'Squirt Sqad')
ON CONFLICT (setting_key) DO NOTHING;
