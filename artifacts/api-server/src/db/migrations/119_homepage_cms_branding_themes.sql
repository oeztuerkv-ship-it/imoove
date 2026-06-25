-- Homepage CMS: Site-Branding (Logo/Favicon) + Section-Themes (Hero, Sections)
ALTER TABLE homepage_content
  ADD COLUMN IF NOT EXISTS site_branding JSONB NOT NULL DEFAULT '{"headerLogoUrl":"","faviconUrl":""}'::jsonb;

ALTER TABLE homepage_content
  ADD COLUMN IF NOT EXISTS section_themes JSONB NOT NULL DEFAULT '{}'::jsonb;
