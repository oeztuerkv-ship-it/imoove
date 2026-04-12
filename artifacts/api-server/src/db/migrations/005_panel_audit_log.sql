-- Audit-Log für sensible Panel-Aktionen.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/005_panel_audit_log.sql

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
