-- Dynamischer Bereich „Unterstützer & Sponsoren“ (Admin-CMS + öffentliche Mobile-Lesestrecke)

CREATE TABLE IF NOT EXISTS app_sponsors (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  logo_url TEXT,
  external_url TEXT,
  button_text TEXT,
  qr_code_url TEXT,
  qr_from_link BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL DEFAULT 'partner',
  audience TEXT NOT NULL DEFAULT 'all',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_sponsors_public_list_idx
  ON app_sponsors (is_active, audience, sort_order, starts_at, ends_at);
