-- Krankenkassen-Partner-Panel (V1): Kostenstellen + Transportschein-Metadaten (kein medizinischer Befund)

CREATE TABLE IF NOT EXISTS insurer_cost_centers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS insurer_cost_centers_company_code_uq
  ON insurer_cost_centers (company_id, lower(code));

CREATE INDEX IF NOT EXISTS insurer_cost_centers_company_idx ON insurer_cost_centers (company_id);

CREATE TABLE IF NOT EXISTS insurer_ride_transport_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insurer_ride_transport_documents_company_ride_idx
  ON insurer_ride_transport_documents (company_id, ride_id);
