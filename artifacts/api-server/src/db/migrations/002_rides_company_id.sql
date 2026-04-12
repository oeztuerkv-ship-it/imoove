-- Mandant für Fahrten (Partner-Portal-Filterung). Typ immer TEXT wie admin_companies.id (z. B. co-demo-1).
-- Bestehende DBs, die schon mit alter `rides`-Definition liefen:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/002_rides_company_id.sql
--
-- Wenn `company_id` bereits als INTEGER existiert, reicht 002 nicht — danach 006_rides_legacy_schema_repair.sql ausführen.
-- Backfill: company_id bleibt NULL bis ihr Fahrten explizit Firmen zuordnet (oder einmaliges UPDATE).

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rides_company_id_idx ON rides (company_id);
