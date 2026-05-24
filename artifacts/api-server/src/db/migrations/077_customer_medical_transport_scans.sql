-- Kunden-Transportschein-Scan vor Krankenfahrt-Buchung (Snapshot bis POST /rides).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 077_customer_medical_transport_scans.sql

CREATE TABLE IF NOT EXISTS customer_medical_transport_scans (
  id TEXT PRIMARY KEY,
  passenger_id TEXT NOT NULL,
  traffic_light TEXT NOT NULL,
  primary_reason_de TEXT NOT NULL DEFAULT '',
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_key TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_ride_id TEXT REFERENCES rides (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_medical_transport_scans_traffic_light_chk
    CHECK (traffic_light IN ('green', 'yellow', 'red'))
);

CREATE INDEX IF NOT EXISTS customer_medical_transport_scans_passenger_created_idx
  ON customer_medical_transport_scans (passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_medical_transport_scans_consumed_idx
  ON customer_medical_transport_scans (consumed_ride_id)
  WHERE consumed_ride_id IS NOT NULL;

COMMENT ON TABLE customer_medical_transport_scans IS
  'Kunden-OCR-Snapshot vor Buchung; wird bei POST /rides (medical) in partner_booking_meta übernommen.';
