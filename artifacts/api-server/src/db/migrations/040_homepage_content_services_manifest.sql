-- Homepage-CMS: Leistungen (Services) + ONRODA Manifest (Marketing, Admin)

ALTER TABLE homepage_content
  ADD COLUMN IF NOT EXISTS services_kicker TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_subline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manifest_kicker TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manifest_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manifest_subline TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manifest_cards JSONB NOT NULL DEFAULT '[]'::jsonb;
