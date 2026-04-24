-- Fahrzeug-Freigabe: Partner kann nicht „aktiv“ setzen; nur Plattform-Admin (approved / rejected / blocked).

ALTER TABLE fleet_vehicles
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS konzession_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_decided_by_admin_id TEXT;

-- FK nur wenn Tabelle existiert (sollte ab Migration 018 da sein)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fleet_vehicles_approval_decided_by_fk'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_auth_users') THEN
      ALTER TABLE fleet_vehicles
        ADD CONSTRAINT fleet_vehicles_approval_decided_by_fk
        FOREIGN KEY (approval_decided_by_admin_id) REFERENCES admin_auth_users (id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

-- Bestand: fahrbereit nur nach Freigabe; bisher is_active = Nutzung „live“
UPDATE fleet_vehicles
SET
  approval_status = CASE
    WHEN is_active IS TRUE THEN 'approved'
    ELSE 'draft'
  END
WHERE approval_status IS NULL;

UPDATE fleet_vehicles
SET konzession_number = NULLIF(TRIM(taxi_order_number), '')
WHERE TRIM(COALESCE(konzession_number, '')) = ''
  AND TRIM(COALESCE(taxi_order_number, '')) <> '';

-- Bestehende Live-Fahrzeuge ohne hinterlegte Konzession: leer lassen, Partner kann nachreichen
ALTER TABLE fleet_vehicles
  ALTER COLUMN approval_status SET NOT NULL,
  ALTER COLUMN approval_status SET DEFAULT 'draft';

UPDATE fleet_vehicles SET is_active = (approval_status = 'approved');

ALTER TABLE fleet_vehicles DROP CONSTRAINT IF EXISTS fleet_vehicles_approval_status_chk;
ALTER TABLE fleet_vehicles
  ADD CONSTRAINT fleet_vehicles_approval_status_chk
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'blocked'));

CREATE INDEX IF NOT EXISTS fleet_vehicles_approval_status_idx ON fleet_vehicles (approval_status);
