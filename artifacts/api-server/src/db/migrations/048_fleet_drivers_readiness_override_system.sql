-- Plattform-intern: Fahrer trotz fehlender Nachweise (P-Schein, Fahrzeugfreigabe, Mandanten-Gate)
-- als "einsatzbereit" behandeln — nur für Operator-/Systemtests (siehe Admin-UI + Audit).
ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS readiness_override_system BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN fleet_drivers.readiness_override_system IS
  'If true, readiness skips company/P-Schein/vehicle blocks; suspension and approval gates remain.';
