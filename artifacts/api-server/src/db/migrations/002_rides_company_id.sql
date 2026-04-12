-- Mandant für Fahrten (Partner-Portal-Filterung).
-- Bestehende DBs, die schon mit alter `rides`-Definition liefen:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/002_rides_company_id.sql
--
-- Backfill: company_id bleibt NULL bis ihr Fahrten explizit Firmen zuordnet (oder einmaliges UPDATE).

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rides_company_id_idx ON rides (company_id);
