-- Fachlicher Freigabe-Status je Fahrer (Operator), unabhängig von Login-Sperre (is_active / access_status).
-- Bestand: operativ voll; Migration setzt default approved.

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE fleet_drivers
  DROP CONSTRAINT IF EXISTS fleet_drivers_approval_status_chk;

ALTER TABLE fleet_drivers
  ADD CONSTRAINT fleet_drivers_approval_status_chk
  CHECK (approval_status IN ('pending', 'in_review', 'approved', 'rejected'));

UPDATE fleet_drivers
SET approval_status = 'approved'
WHERE trim(coalesce(approval_status, '')) = ''
  OR lower(trim(approval_status)) NOT IN ('pending', 'in_review', 'approved', 'rejected');
