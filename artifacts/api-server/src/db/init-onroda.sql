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
  panel_modules JSONB DEFAULT NULL
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
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_auth_users_role_chk CHECK (role IN ('admin', 'service'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_users_username_lower ON admin_auth_users (lower(username));

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

-- Ersten Benutzer: company_id = bestehende admin_companies.id; password_hash = Ausgabe von
-- hashPassword() (artifacts/api-server/src/lib/password.ts), Präfix v1.*.
