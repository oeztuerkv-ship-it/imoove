-- Taxi-Unternehmer: Mandanten-Profil (Compliance), Flotte, Fahrer, Zuweisung.
-- company_id überall TEXT wie admin_companies.id (kein UUID-Mix).

ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS company_kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS tax_id TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS concession_number TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS compliance_gewerbe_storage_key TEXT;
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS compliance_insurance_storage_key TEXT;

CREATE TABLE IF NOT EXISTS fleet_drivers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  access_status TEXT NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  p_schein_number TEXT NOT NULL DEFAULT '',
  p_schein_expiry DATE,
  p_schein_doc_storage_key TEXT,
  last_login_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fleet_drivers_access_status_chk CHECK (access_status IN ('active', 'suspended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_email_lower_uidx ON fleet_drivers (lower(trim(email)));
CREATE INDEX IF NOT EXISTS fleet_drivers_company_idx ON fleet_drivers (company_id);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  license_plate TEXT NOT NULL,
  vin TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  vehicle_type TEXT NOT NULL DEFAULT 'sedan',
  taxi_order_number TEXT NOT NULL DEFAULT '',
  next_inspection_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fleet_vehicles_type_chk CHECK (
    vehicle_type IN ('sedan', 'station_wagon', 'van', 'wheelchair')
  )
);

CREATE INDEX IF NOT EXISTS fleet_vehicles_company_idx ON fleet_vehicles (company_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_plate_idx ON fleet_vehicles (company_id, license_plate);

CREATE TABLE IF NOT EXISTS driver_vehicle_assignments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL REFERENCES fleet_drivers (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES fleet_vehicles (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_vehicle_assignments_driver_uidx UNIQUE (driver_id),
  CONSTRAINT driver_vehicle_assignments_vehicle_uidx UNIQUE (vehicle_id)
);

CREATE INDEX IF NOT EXISTS driver_vehicle_assignments_company_idx ON driver_vehicle_assignments (company_id);
