-- Fahrttyp (Produktlinie) und Zahlerlogik für spätere Abrechnung.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/008_rides_ride_kind_payer_kind.sql

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS ride_kind TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS payer_kind TEXT NOT NULL DEFAULT 'passenger',
  ADD COLUMN IF NOT EXISTS voucher_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_reference TEXT;

COMMENT ON COLUMN rides.ride_kind IS 'standard | medical | voucher | company';
COMMENT ON COLUMN rides.payer_kind IS 'passenger | company | insurance | voucher | third_party';
