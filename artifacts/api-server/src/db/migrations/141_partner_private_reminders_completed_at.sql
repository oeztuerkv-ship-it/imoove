-- Private Merkliste: „Erledigt“ ohne Löschen (Badge/Erinnerung weg).

ALTER TABLE partner_private_reminders
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN partner_private_reminders.completed_at IS
  'NULL = offen; gesetzt = erledigt (bleibt in DB, keine lokale Erinnerung)';
