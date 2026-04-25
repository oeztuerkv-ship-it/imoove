CREATE TABLE IF NOT EXISTS homepage_content (
  id TEXT PRIMARY KEY,
  hero_headline TEXT NOT NULL DEFAULT '',
  hero_subline TEXT NOT NULL DEFAULT '',
  cta1_text TEXT NOT NULL DEFAULT '',
  cta1_link TEXT NOT NULL DEFAULT '',
  cta2_text TEXT NOT NULL DEFAULT '',
  cta2_link TEXT NOT NULL DEFAULT '',
  notice_text TEXT NOT NULL DEFAULT '',
  notice_active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
