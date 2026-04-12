-- Einmalig auf der PostgreSQL-Instanz ausführen (psql oder GUI).
-- DATABASE_URL in api-server .env setzen.
--
-- Reihenfolge: Mandanten-Tabelle vor rides (FK company_id).

CREATE TABLE IF NOT EXISTS admin_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_priority_company BOOLEAN NOT NULL DEFAULT FALSE,
  priority_for_live_rides BOOLEAN NOT NULL DEFAULT FALSE,
  priority_for_reservations BOOLEAN NOT NULL DEFAULT FALSE,
  priority_price_threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  priority_timeout_seconds INTEGER NOT NULL DEFAULT 90,
  release_radius_km DOUBLE PRECISION NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS fare_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  is_required_area TEXT NOT NULL,
  fixed_price_allowed TEXT NOT NULL,
  status TEXT NOT NULL
);

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
  rejected_by JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS rides_company_id_idx ON rides (company_id);

-- Partner-Panel (panel.onroda.de): Benutzer pro Unternehmen, Passwort-Login nur über diese Tabelle.
CREATE TABLE IF NOT EXISTS panel_users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT panel_users_role_chk CHECK (role IN ('owner', 'manager', 'staff', 'readonly'))
);

CREATE UNIQUE INDEX IF NOT EXISTS panel_users_username_lower ON panel_users (lower(username));

CREATE INDEX IF NOT EXISTS panel_users_company_id_idx ON panel_users (company_id);

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

-- Ersten Benutzer: company_id = bestehende admin_companies.id; password_hash = Ausgabe von
-- hashPassword() (artifacts/api-server/src/lib/password.ts), Präfix v1.*.
