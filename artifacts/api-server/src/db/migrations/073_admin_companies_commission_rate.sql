-- Mandanten-Provision für ride_financials (Dezimal: 0.10 = 10 %).
ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.10;

COMMENT ON COLUMN admin_companies.commission_rate IS
  'ONRODA-Provisionssatz als Dezimalzahl (0.10 = 10 %). Wird bei Fahrtabschluss in ride_financials übernommen.';
