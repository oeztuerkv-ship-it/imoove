-- Plattform-Admin: Sperrgrund (Anzeige) + interne Notiz je Fahrer.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 045_fleet_drivers_admin_note_suspension.sql

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_internal_note TEXT NOT NULL DEFAULT '';
