-- Delta für bestehende Datenbanken (bereits provisionierte Instanzen ohne panel_users).
-- Neuinstallation: alternativ komplett `src/db/init-onroda.sql` ausführen.
-- Ausführung z. B.: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/001_panel_users.sql

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
  CONSTRAINT panel_users_role_chk CHECK (role IN ('owner', 'manager', 'staff'))
);

CREATE UNIQUE INDEX IF NOT EXISTS panel_users_username_lower ON panel_users (lower(username));

CREATE INDEX IF NOT EXISTS panel_users_company_id_idx ON panel_users (company_id);

-- Ersten Benutzer: INSERT mit id (z. B. cuid/uuid), company_id aus admin_companies,
-- username, email, password_hash im Format aus src/lib/password.ts (Präfix v1.*),
-- role in ('owner','manager','staff'). Hash z. B. temporär per kleinem Node-Skript
-- mit import { hashPassword } from '../lib/password.js' erzeugen (nach build/ts).
