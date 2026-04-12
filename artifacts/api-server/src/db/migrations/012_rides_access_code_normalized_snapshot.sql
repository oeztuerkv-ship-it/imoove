-- Unveränderlicher Bezug zum eingelösten Code (normalisiert) für Verlauf/Abrechnung — nicht an Fahrer-Pool.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/012_rides_access_code_normalized_snapshot.sql

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS access_code_normalized_snapshot TEXT DEFAULT NULL;

COMMENT ON COLUMN rides.access_code_normalized_snapshot IS 'Kopie von normalize(code) bei Buchung; Nachvollziehbarkeit auch wenn Code-Datensatz geändert wird';
