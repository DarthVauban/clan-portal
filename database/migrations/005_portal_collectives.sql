CREATE TABLE IF NOT EXISTS portal_collectives (
  collective_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_collective_members (
  player_id TEXT PRIMARY KEY REFERENCES portal_players(player_id) ON DELETE CASCADE,
  collective_id TEXT NOT NULL REFERENCES portal_collectives(collective_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'recruiter', 'treasurer', 'raid-leader', 'member')),
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_collective_members_collective_id ON portal_collective_members(collective_id);
