-- Erweitert Freigabe-Status für explizites „Unterlagen fehlen“ (Admin ↔ Partner).
-- Fahrzeuge: draft | pending_approval | missing_documents | approved | rejected | blocked
-- Fahrer: pending | in_review | missing_documents | approved | rejected

ALTER TABLE fleet_vehicles DROP CONSTRAINT IF EXISTS fleet_vehicles_approval_status_chk;
ALTER TABLE fleet_vehicles
  ADD CONSTRAINT fleet_vehicles_approval_status_chk CHECK (
    approval_status IN ('draft', 'pending_approval', 'missing_documents', 'approved', 'rejected', 'blocked')
  );

ALTER TABLE fleet_drivers DROP CONSTRAINT IF EXISTS fleet_drivers_approval_status_chk;
ALTER TABLE fleet_drivers
  ADD CONSTRAINT fleet_drivers_approval_status_chk CHECK (
    approval_status IN ('pending', 'in_review', 'missing_documents', 'approved', 'rejected')
  );
