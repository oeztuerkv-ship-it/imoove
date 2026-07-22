-- Zeitpunkt des letzten erfolgreichen Markt-GPS-Writes (Dispatch-Radius / Outlier-Max-Age).
ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS last_market_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN fleet_drivers.last_market_at IS
  'Zeitpunkt letzter erfolgreicher Schreibvorgang von last_market_lat/lon; NULL nach ONLINE-Reset.';
