CREATE TABLE IF NOT EXISTS homepage_placeholders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  cta_label TEXT,
  cta_url TEXT,
  tone TEXT NOT NULL DEFAULT 'info',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible_from TIMESTAMPTZ,
  visible_until TIMESTAMPTZ,
  dismiss_key TEXT NOT NULL DEFAULT '',
  created_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  updated_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homepage_placeholders_active_order_idx
  ON homepage_placeholders (is_active, sort_order, created_at DESC);
