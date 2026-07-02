-- Fahrtende für Abrechnungszeiträume (Tages-/Wochen-/Monats-/Jahresabrechnung).
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN rides.completed_at IS 'Zeitpunkt Fahrtabschluss (status=completed); Abrechnungszeiträume nach Fahrtende.';

UPDATE rides r
SET completed_at = sub.completed_at
FROM (
  SELECT DISTINCT ON (ride_id)
    ride_id,
    created_at AS completed_at
  FROM ride_events
  WHERE event_type = 'ride_status_changed'
    AND to_status = 'completed'
  ORDER BY ride_id, created_at ASC
) sub
WHERE r.id = sub.ride_id
  AND r.status = 'completed'
  AND r.completed_at IS NULL;

UPDATE rides
SET completed_at = created_at
WHERE status = 'completed'
  AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS rides_completed_at_idx ON rides (completed_at DESC)
  WHERE status = 'completed';
