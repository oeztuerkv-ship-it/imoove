ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS last_market_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_market_lon DOUBLE PRECISION NULL;

COMMENT ON COLUMN fleet_drivers.last_market_lat IS 'Letzte GPS-Position am Auftragsmarkt (für Dispatch-Radius).';
COMMENT ON COLUMN fleet_drivers.last_market_lon IS 'Letzte GPS-Position am Auftragsmarkt (für Dispatch-Radius).';
