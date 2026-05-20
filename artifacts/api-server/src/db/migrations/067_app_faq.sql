-- Mobile App: FAQ (Admin-CMS, öffentlicher GET /api/app/faq)

CREATE TABLE IF NOT EXISTS app_faq (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_faq_public_list_idx
  ON app_faq (active, category, sort_order, created_at);

COMMENT ON TABLE app_faq IS 'FAQ für Kunden-App (Hilfe-Screen); getrennt von homepage_faq_items.';
