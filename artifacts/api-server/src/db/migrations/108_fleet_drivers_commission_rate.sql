-- Individuelle ONRODA-Provision pro Fahrer (NULL = Mandanten-Satz aus admin_companies).
ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS commission_rate DOUBLE PRECISION;

COMMENT ON COLUMN fleet_drivers.commission_rate IS
  'Optionaler Provisionssatz als Dezimalzahl (0.08 = 8 %). NULL = admin_companies.commission_rate.';
