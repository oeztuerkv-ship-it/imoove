-- Konsole: Rollen taxi / insurance / hotel + optionaler Mandanten-Scope (Hotel).
ALTER TABLE admin_auth_users DROP CONSTRAINT IF EXISTS admin_auth_users_role_chk;

ALTER TABLE admin_auth_users
  ADD COLUMN IF NOT EXISTS scope_company_id TEXT;

ALTER TABLE admin_auth_users
  ADD CONSTRAINT admin_auth_users_role_chk CHECK (
    role IN ('admin', 'service', 'taxi', 'insurance', 'hotel')
  );
