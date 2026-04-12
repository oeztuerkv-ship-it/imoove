-- Partner-Panel: pro Mandant aktivierte Module (JSON-Array von Modul-IDs); NULL = alle Module (Default).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/011_admin_companies_panel_modules.sql

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS panel_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN admin_companies.panel_modules IS 'Aktivierte Partner-Panel-Modul-IDs (JSON array); NULL = alle Module für Abwärtskompatibilität';
