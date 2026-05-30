-- Gruppierung von Sammel-Sendungen im Admin (Lesestatus pro Empfänger)

ALTER TABLE partner_messages ADD COLUMN IF NOT EXISTS batch_id TEXT;

CREATE INDEX IF NOT EXISTS partner_messages_batch_id_created_idx
  ON partner_messages (batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN partner_messages.batch_id IS 'Gemeinsame ID einer Admin-Sammelsendung (mehrere Empfänger).';
