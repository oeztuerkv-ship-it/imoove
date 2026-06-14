-- Häufige Filter: Kunden-Historie, Fahrer-Jobs, Status-Listen / Dispatch.
CREATE INDEX IF NOT EXISTS rides_passenger_id_idx ON rides (passenger_id);
CREATE INDEX IF NOT EXISTS rides_driver_id_idx ON rides (driver_id);
CREATE INDEX IF NOT EXISTS rides_status_idx ON rides (status);
