-- Operator: Broadcast- und Einzelnachrichten an Fahrer (Push + In-App-Historie)

CREATE TABLE IF NOT EXISTS driver_messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  target_driver_id TEXT NULL REFERENCES fleet_drivers (id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS driver_messages_sent_at_idx
  ON driver_messages (sent_at DESC);

CREATE INDEX IF NOT EXISTS driver_messages_target_driver_idx
  ON driver_messages (target_driver_id, sent_at DESC);

COMMENT ON TABLE driver_messages IS 'Plattform-Nachrichten an Fahrer; target_driver_id NULL = Sammelnachricht an alle.';
