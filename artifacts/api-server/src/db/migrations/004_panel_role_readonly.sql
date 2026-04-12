-- Rolle `readonly` für Panel-Benutzer (nur-Lesen).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/004_panel_role_readonly.sql

ALTER TABLE panel_users DROP CONSTRAINT IF EXISTS panel_users_role_chk;

ALTER TABLE panel_users
  ADD CONSTRAINT panel_users_role_chk CHECK (role IN ('owner', 'manager', 'staff', 'readonly'));
