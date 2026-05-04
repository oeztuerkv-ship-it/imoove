-- Mobile App: dynamische „Neuigkeiten“ (Admin-pflegbar, öffentlicher Lese-Endpunkt)

CREATE TABLE IF NOT EXISTS app_news_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  button_text TEXT,
  target_type TEXT NOT NULL DEFAULT 'none',
  target_value TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_news_items_public_list_idx
  ON app_news_items (is_active, audience, sort_order, starts_at, ends_at);
