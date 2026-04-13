-- Lebenszyklus für Freigabe-Codes: atomare Reservierung pro Fahrt, Einlösung bei Abschluss.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/013_access_code_lifecycle_reserve.sql

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reserved_ride_id TEXT DEFAULT NULL;

COMMENT ON COLUMN access_codes.lifecycle_status IS 'active | reserved | redeemed — Buchung reserviert sofort, Abschluss erhöht uses_count';
COMMENT ON COLUMN access_codes.reserved_ride_id IS 'Fahrt, die den Code aktuell gebunden hat (kein zweites Parallel-Booking)';

-- uses_count = abgeschlossene Einlösungen (nicht mehr „+1 bei Buchung“)
UPDATE access_codes ac
SET uses_count = COALESCE(
  (
    SELECT COUNT(*)::int
    FROM rides r
    WHERE r.access_code_id = ac.id
      AND r.status = 'completed'
  ),
  0
);

-- Offene Fahrten: Code als reserviert markieren
UPDATE access_codes ac
SET
  lifecycle_status = 'reserved',
  reserved_ride_id = sub.ride_id
FROM (
  SELECT DISTINCT ON (access_code_id)
    access_code_id AS code_id,
    id AS ride_id
  FROM rides
  WHERE access_code_id IS NOT NULL
    AND status IN ('pending', 'accepted', 'arrived', 'in_progress')
  ORDER BY access_code_id, created_at DESC
) AS sub
WHERE ac.id = sub.code_id;

-- Kontingent bereits durch Abschlüsse erschöpft
UPDATE access_codes
SET lifecycle_status = 'redeemed'
WHERE max_uses IS NOT NULL
  AND uses_count >= max_uses
  AND lifecycle_status <> 'reserved';
