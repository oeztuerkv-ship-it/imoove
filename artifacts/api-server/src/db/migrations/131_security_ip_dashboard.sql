-- Plattform-Sicherheit: IP-Whitelist, permanente Blockliste, Ban-Events (Fail2Ban-Dashboard)

CREATE TABLE IF NOT EXISTS security_ip_whitelist (
  id TEXT PRIMARY KEY,
  ip_cidr TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS security_ip_whitelist_ip_cidr_uq
  ON security_ip_whitelist (ip_cidr);

CREATE INDEX IF NOT EXISTS security_ip_whitelist_active_idx
  ON security_ip_whitelist (active, created_at DESC);

COMMENT ON TABLE security_ip_whitelist IS
  'Team-/Operator-IPs die nie per Fail2Ban gesperrt werden sollen (Panel-gesteuert).';

CREATE TABLE IF NOT EXISTS security_ip_blocklist (
  id TEXT PRIMARY KEY,
  ip_cidr TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS security_ip_blocklist_ip_cidr_uq
  ON security_ip_blocklist (ip_cidr);

CREATE INDEX IF NOT EXISTS security_ip_blocklist_active_idx
  ON security_ip_blocklist (active, created_at DESC);

COMMENT ON TABLE security_ip_blocklist IS
  'Manuell gepflegte permanente IP-Sperren (zusätzlich zu zeitlichen Fail2Ban-Jails).';

CREATE TABLE IF NOT EXISTS security_ban_events (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  jail TEXT,
  action TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin_api',
  admin_username TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_ban_events_created_at_idx
  ON security_ban_events (created_at DESC);

CREATE INDEX IF NOT EXISTS security_ban_events_action_created_idx
  ON security_ban_events (action, created_at DESC);

COMMENT ON TABLE security_ban_events IS
  'Audit/Historie für Sperren und Entsperren aus dem Admin-Sicherheits-Dashboard.';
