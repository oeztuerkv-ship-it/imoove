-- Reparatur für ältere Produktions-DBs: `rides.company_id` als INTEGER statt TEXT (Mandanten-IDs sind TEXT, z. B. co-demo-1),
-- sowie fehlende Spalten, die die aktuelle API/Drizzle erwartet.
-- Nach 002–005 ausführen, wenn ihr von einem sehr alten `rides`-Stand kommt.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/006_rides_legacy_schema_repair.sql
--
-- Hinweis: Nach Typwechsel INTEGER→TEXT ggf. Fahrten mit UPDATE auf echte admin_companies.id setzen.

DO $repair$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'rides'
      AND c.column_name = 'company_id'
      AND c.data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_company_id_fkey;
    ALTER TABLE rides ALTER COLUMN company_id TYPE TEXT USING company_id::text;
  END IF;
END $repair$;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS from_label TEXT NOT NULL DEFAULT '';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS from_full TEXT NOT NULL DEFAULT '';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS from_lat DOUBLE PRECISION;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS from_lon DOUBLE PRECISION;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS to_label TEXT NOT NULL DEFAULT '';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS to_full TEXT NOT NULL DEFAULT '';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS to_lat DOUBLE PRECISION;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS to_lon DOUBLE PRECISION;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS rejected_by JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Optional: Wenn alle company_id-Werte gültige admin_companies.id sind, FK manuell:
--   ALTER TABLE rides ADD CONSTRAINT rides_company_id_fkey
--     FOREIGN KEY (company_id) REFERENCES admin_companies (id) ON DELETE SET NULL;
