-- Serienfahrten (z. B. Krankenfahrt-Kontingent) — Kopf-Datensatz; Einzelfahrten verweisen in partner_booking_meta.medical.seriesId
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/014_partner_ride_series.sql

CREATE TABLE IF NOT EXISTS partner_ride_series (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  patient_reference TEXT NOT NULL DEFAULT '',
  billing_reference TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  total_rides INTEGER NOT NULL CHECK (total_rides >= 1 AND total_rides <= 104),
  status TEXT NOT NULL DEFAULT 'active',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_ride_series_status_chk CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS partner_ride_series_company_idx ON partner_ride_series (company_id, created_at DESC);
