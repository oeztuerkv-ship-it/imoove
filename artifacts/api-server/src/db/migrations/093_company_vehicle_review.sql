-- Onboarding-Fahrzeuge: Prüfstatus, Operator-Antworten, Nachrichtenverlauf (093).

ALTER TABLE company_vehicles
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS operator_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_vehicles_review_status_chk'
  ) THEN
    ALTER TABLE company_vehicles
      ADD CONSTRAINT company_vehicles_review_status_chk
      CHECK (review_status IN ('draft', 'pending', 'active', 'inactive', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS company_vehicles_review_status_idx
  ON company_vehicles (review_status, submitted_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS company_operator_messages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES company_vehicles (id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL,
  sender_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  sender_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_operator_messages_sender_type_chk
    CHECK (sender_type IN ('admin', 'partner'))
);

CREATE INDEX IF NOT EXISTS company_operator_messages_company_created_idx
  ON company_operator_messages (company_id, created_at ASC);

CREATE INDEX IF NOT EXISTS company_operator_messages_vehicle_idx
  ON company_operator_messages (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
