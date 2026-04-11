-- Einmalig auf der PostgreSQL-Instanz ausführen (psql oder GUI).
-- DATABASE_URL in api-server .env setzen.

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
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
