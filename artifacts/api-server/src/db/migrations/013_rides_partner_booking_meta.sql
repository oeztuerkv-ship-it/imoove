-- Partner-Buchungskontext (Hotel, Medizin, Serien) — JSONB, mandantengebunden über rides.company_id
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/013_rides_partner_booking_meta.sql

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS partner_booking_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
