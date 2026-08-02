-- Private Merkliste (Taxi-Panel Aufträge) — kein Dispatch, keine Abrechnung.

CREATE TABLE IF NOT EXISTS partner_private_reminders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  created_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  from_full TEXT NOT NULL DEFAULT '',
  to_full TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_private_reminders_company_sched_idx
  ON partner_private_reminders (company_id, scheduled_at);

COMMENT ON TABLE partner_private_reminders IS
  'Private organisatorische Merklisten-Einträge (Taxi-Panel); kein Matching/Dispatch.';
