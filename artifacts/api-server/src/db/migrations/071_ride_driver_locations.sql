-- Persistente Fahrer-GPS pro aktiver Fahrt (Geofence, Kunden-Live, Ghost-Recovery).

CREATE TABLE IF NOT EXISTS ride_driver_locations (
  ride_id TEXT PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  fleet_driver_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_driver_locations_updated_at_idx
  ON ride_driver_locations (updated_at DESC);

COMMENT ON TABLE ride_driver_locations IS 'Letzte Fahrer-Position pro Fahrt; ersetzt reinen In-Memory-Cache über API-Neustarts.';
