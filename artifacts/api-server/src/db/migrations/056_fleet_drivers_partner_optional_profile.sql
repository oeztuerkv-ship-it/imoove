-- Partner: optionale Fahrer-Stammdaten (Anschrift, Führerschein) — keine Pflicht für Anlage.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 056_fleet_drivers_partner_optional_profile.sql

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS home_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS drivers_license_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS drivers_license_expiry DATE;
