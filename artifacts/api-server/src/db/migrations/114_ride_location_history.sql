-- Migration 114: GPS-Ping-Historie pro Fahrt (Haversine-Abrechnung, Admin-Nachverfolgung).

CREATE TABLE IF NOT EXISTS ride_location_history (
  id BIGSERIAL PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  fleet_driver_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_location_history_ride_recorded_idx
  ON ride_location_history (ride_id, recorded_at ASC);

CREATE INDEX IF NOT EXISTS ride_location_history_recorded_at_idx
  ON ride_location_history (recorded_at ASC);

COMMENT ON TABLE ride_location_history IS 'GPS-Ping-Historie während aktiver Fahrt; Rohdaten für Distanz-Nachweis (Retention ~90 Tage).';
