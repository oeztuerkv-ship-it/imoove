-- Einmalig auf der PostgreSQL-Instanz ausführen (psql oder GUI).
-- DATABASE_URL in api-server .env setzen.
--
-- Reihenfolge: Mandanten-Tabelle vor rides (FK company_id).

CREATE TABLE IF NOT EXISTS admin_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  vat_id TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_priority_company BOOLEAN NOT NULL DEFAULT FALSE,
  priority_for_live_rides BOOLEAN NOT NULL DEFAULT FALSE,
  priority_for_reservations BOOLEAN NOT NULL DEFAULT FALSE,
  priority_price_threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  priority_timeout_seconds INTEGER NOT NULL DEFAULT 90,
  release_radius_km DOUBLE PRECISION NOT NULL DEFAULT 10,
  panel_modules JSONB DEFAULT NULL,
  company_kind TEXT NOT NULL DEFAULT 'general',
  tax_id TEXT NOT NULL DEFAULT '',
  concession_number TEXT NOT NULL DEFAULT '',
  compliance_gewerbe_storage_key TEXT,
  compliance_insurance_storage_key TEXT
);

CREATE TABLE IF NOT EXISTS fare_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  is_required_area TEXT NOT NULL,
  fixed_price_allowed TEXT NOT NULL,
  status TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  base_fare_eur DOUBLE PRECISION NOT NULL DEFAULT 4.3,
  rate_first_km_eur DOUBLE PRECISION NOT NULL DEFAULT 3.0,
  rate_after_km_eur DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  threshold_km DOUBLE PRECISION NOT NULL DEFAULT 4,
  waiting_per_hour_eur DOUBLE PRECISION NOT NULL DEFAULT 38,
  service_fee_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
  onroda_base_fare_eur DOUBLE PRECISION NOT NULL DEFAULT 3.5,
  onroda_per_km_eur DOUBLE PRECISION NOT NULL DEFAULT 2.2,
  onroda_min_fare_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
  manual_fixed_price_eur DOUBLE PRECISION
);

-- Digitale Freigabe / Kostenübernahme (Hotel, Firma, …); code_type = Kanal; company_id = Abrechnungs-Mandant.
CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  code_normalized TEXT NOT NULL UNIQUE,
  code_type TEXT NOT NULL,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  reserved_ride_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_codes_company_id_idx ON access_codes (company_id);

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  passenger_id TEXT,
  driver_id TEXT,
  from_label TEXT NOT NULL,
  from_full TEXT NOT NULL,
  from_lat DOUBLE PRECISION,
  from_lon DOUBLE PRECISION,
  to_label TEXT NOT NULL,
  to_full TEXT NOT NULL,
  to_lat DOUBLE PRECISION,
  to_lon DOUBLE PRECISION,
  distance_km DOUBLE PRECISION NOT NULL,
  duration_minutes INTEGER NOT NULL,
  estimated_fare DOUBLE PRECISION NOT NULL,
  final_fare DOUBLE PRECISION,
  payment_method TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  rejected_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  ride_kind TEXT NOT NULL DEFAULT 'standard',
  payer_kind TEXT NOT NULL DEFAULT 'passenger',
  voucher_code TEXT,
  billing_reference TEXT,
  authorization_source TEXT NOT NULL DEFAULT 'passenger_direct',
  access_code_id TEXT REFERENCES access_codes (id) ON DELETE SET NULL,
  access_code_normalized_snapshot TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS rides_company_id_idx ON rides (company_id);
CREATE INDEX IF NOT EXISTS rides_created_at_desc_idx ON rides (created_at DESC);

CREATE TABLE IF NOT EXISTS ride_events (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_events_ride_created_idx ON ride_events (ride_id, created_at DESC);

-- Partner-Panel (panel.onroda.de): Benutzer pro Unternehmen, Passwort-Login nur über diese Tabelle.
CREATE TABLE IF NOT EXISTS panel_users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT panel_users_role_chk CHECK (role IN ('owner', 'manager', 'staff', 'readonly'))
);

CREATE UNIQUE INDEX IF NOT EXISTS panel_users_username_lower ON panel_users (lower(username));

CREATE INDEX IF NOT EXISTS panel_users_company_id_idx ON panel_users (company_id);

CREATE TABLE IF NOT EXISTS admin_auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  scope_company_id TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_auth_users_role_chk CHECK (role IN ('admin', 'service', 'taxi', 'insurance', 'hotel'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_users_username_lower ON admin_auth_users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_users_email_lower ON admin_auth_users (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS admin_auth_password_resets (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_auth_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_password_resets_token_hash_uq ON admin_auth_password_resets (token_hash);
CREATE INDEX IF NOT EXISTS admin_auth_password_resets_user_created_idx ON admin_auth_password_resets (admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_auth_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_auth_audit_log_created_idx ON admin_auth_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS panel_audit_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  actor_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS panel_audit_log_company_created_idx ON panel_audit_log (company_id, created_at DESC);

-- rides.created_by_panel_user_id (FK erst nach panel_users möglich)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rides_created_by_panel_user_id_idx ON rides (created_by_panel_user_id);

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS partner_booking_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS partner_ride_series (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  patient_reference TEXT NOT NULL DEFAULT '',
  billing_reference TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  total_rides INTEGER NOT NULL CHECK (total_rides >= 1 AND total_rides <= 104),
  status TEXT NOT NULL DEFAULT 'active',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_ride_series_status_chk CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS partner_ride_series_company_idx ON partner_ride_series (company_id, created_at DESC);

-- Taxi-Unternehmer / Flotte (siehe Migration 022 — hier für frische Instanzen gespiegelt)
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

-- Governance-Hardening (Migration 023)
ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS legal_form TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_iban TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_bic TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dispo_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_hours TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS compliance_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contract_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_drivers INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_vehicles INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS fare_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insurer_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS area_assignments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS company_change_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  requested_by_panel_user_id TEXT NOT NULL REFERENCES panel_users (id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_decision_note TEXT NOT NULL DEFAULT '',
  decided_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_change_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS company_change_requests_company_idx ON company_change_requests (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_change_requests_status_idx ON company_change_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_registration_requests (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  legal_form TEXT NOT NULL DEFAULT '',
  partner_type TEXT NOT NULL,
  uses_vouchers BOOLEAN NOT NULL DEFAULT FALSE,
  contact_first_name TEXT NOT NULL DEFAULT '',
  contact_last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  vat_id TEXT NOT NULL DEFAULT '',
  concession_number TEXT NOT NULL DEFAULT '',
  desired_region TEXT NOT NULL DEFAULT '',
  requested_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  registration_status TEXT NOT NULL DEFAULT 'open',
  verification_status TEXT NOT NULL DEFAULT 'pending',
  compliance_status TEXT NOT NULL DEFAULT 'pending',
  contract_status TEXT NOT NULL DEFAULT 'inactive',
  missing_documents_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  master_data_locked BOOLEAN NOT NULL DEFAULT TRUE,
  linked_company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  reviewed_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_registration_requests_status_chk
    CHECK (registration_status IN ('open', 'in_review', 'documents_required', 'approved', 'rejected', 'blocked')),
  CONSTRAINT partner_registration_requests_partner_type_chk
    CHECK (partner_type IN ('taxi', 'hotel', 'insurance', 'medical', 'care', 'business', 'voucher_partner', 'other')),
  CONSTRAINT partner_registration_requests_verification_chk
    CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected')),
  CONSTRAINT partner_registration_requests_compliance_chk
    CHECK (compliance_status IN ('pending', 'complete', 'missing_documents', 'rejected')),
  CONSTRAINT partner_registration_requests_contract_chk
    CHECK (contract_status IN ('inactive', 'pending', 'active', 'suspended', 'terminated'))
);

CREATE INDEX IF NOT EXISTS partner_registration_requests_status_created_idx
  ON partner_registration_requests (registration_status, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_registration_requests_email_created_idx
  ON partner_registration_requests (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS partner_registration_documents (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES partner_registration_requests (id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by_actor_type TEXT NOT NULL DEFAULT 'partner',
  uploaded_by_actor_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_registration_documents_request_created_idx
  ON partner_registration_documents (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_registration_timeline (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES partner_registration_requests (id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_label TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_registration_timeline_request_created_idx
  ON partner_registration_timeline (request_id, created_at DESC);

-- Ersten Benutzer: company_id = bestehende admin_companies.id; password_hash = Ausgabe von
-- hashPassword() (artifacts/api-server/src/lib/password.ts), Präfix v1.*.
