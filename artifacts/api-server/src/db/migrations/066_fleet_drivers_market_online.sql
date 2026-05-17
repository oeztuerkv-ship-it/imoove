-- Auftragsmarkt ONLINE/OFFLINE (Fleet-App) — persistent über Deploy/Neustart.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 066_fleet_drivers_market_online.sql

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS is_market_online BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN fleet_drivers.is_market_online IS
  'Fleet-App: Fahrer nimmt neue Markt-Sofortaufträge an (false = offline am Markt).';
