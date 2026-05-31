-- Onboarding-Fahrzeugliste pro Mandant (089) — getrennt von fleet_vehicles (Betrieb/Flotte).

CREATE TABLE IF NOT EXISTS company_vehicles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies(id) ON DELETE CASCADE,
  license_plate TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  concession_number TEXT NOT NULL DEFAULT '',
  tuev_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_vehicles_company_id_idx ON company_vehicles(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_vehicles_vehicle_type_chk'
  ) THEN
    ALTER TABLE company_vehicles
      ADD CONSTRAINT company_vehicles_vehicle_type_chk
      CHECK (vehicle_type IN ('limousine', 'kombi', 'van', 'wheelchair'));
  END IF;
END $$;
