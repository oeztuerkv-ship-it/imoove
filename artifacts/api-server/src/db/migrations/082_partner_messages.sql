-- Operator → Partner: Einweg-Nachrichten (Posteingang Web + Mobile)

CREATE TABLE IF NOT EXISTS partner_messages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_admin TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS partner_messages_company_created_idx
  ON partner_messages (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_messages_company_unread_idx
  ON partner_messages (company_id, is_read)
  WHERE is_read = FALSE;

COMMENT ON TABLE partner_messages IS 'Plattform-Nachrichten an Partner-Mandanten (Hotel/Agentur); je Zeile ein Empfänger.';
