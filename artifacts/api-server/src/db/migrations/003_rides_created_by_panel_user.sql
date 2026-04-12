-- Partner-Panel: Urheber der Fahrt (welcher panel_users-Eintrag hat angelegt).
-- Ausführen z. B.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/003_rides_created_by_panel_user.sql

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rides_created_by_panel_user_id_idx ON rides (created_by_panel_user_id);
