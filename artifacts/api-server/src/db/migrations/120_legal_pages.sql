-- CMS: Rechtstexte (AGB, Datenschutz, Impressum) — ohne Code-Deploy editierbar.
CREATE TABLE IF NOT EXISTS legal_pages (
  slug text PRIMARY KEY,
  page_title text NOT NULL DEFAULT '',
  stand_label text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_pages IS 'Marketing-Rechtstexte (AGB, Datenschutz, Impressum); Admin-CMS.';
COMMENT ON COLUMN legal_pages.slug IS 'agb | datenschutz | impressum';
COMMENT ON COLUMN legal_pages.body_html IS 'HTML-Inhalt innerhalb von article.card (inkl. h1, Absätze, Footer-Links).';
