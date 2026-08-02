-- Idempotenz: Partner-Monatsreport (1. des Monats) — ein Versand pro Firma + Vormonat.

CREATE TABLE IF NOT EXISTS partner_monthly_report_sends (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_invoice_count INTEGER NOT NULL DEFAULT 0,
  open_kranken_invoice_count INTEGER NOT NULL DEFAULT 0,
  mail_status TEXT NOT NULL DEFAULT 'sent',
  actor_label TEXT NOT NULL DEFAULT '',
  CONSTRAINT partner_monthly_report_sends_period_ym_chk
    CHECK (period_ym ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_monthly_report_sends_company_period_uidx
  ON partner_monthly_report_sends (company_id, period_ym);

CREATE INDEX IF NOT EXISTS partner_monthly_report_sends_sent_at_idx
  ON partner_monthly_report_sends (sent_at DESC);

COMMENT ON TABLE partner_monthly_report_sends IS
  'Idempotenz Partner-Monatsreport E-Mail (period_ym = abgefragter Vormonat Europe/Berlin).';
