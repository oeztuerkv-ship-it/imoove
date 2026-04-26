-- Homepage-CMS Module: FAQ, "So funktioniert", Trust-KPIs

CREATE TABLE IF NOT EXISTS homepage_faq_items (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  updated_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homepage_faq_items_sort_idx
  ON homepage_faq_items (is_active, sort_order, created_at DESC);

CREATE TABLE IF NOT EXISTS homepage_how_steps (
  id TEXT PRIMARY KEY,
  icon TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  updated_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homepage_how_steps_sort_idx
  ON homepage_how_steps (is_active, sort_order, created_at DESC);

CREATE TABLE IF NOT EXISTS homepage_trust_metrics (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  updated_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homepage_trust_metrics_sort_idx
  ON homepage_trust_metrics (is_active, sort_order, created_at DESC);
