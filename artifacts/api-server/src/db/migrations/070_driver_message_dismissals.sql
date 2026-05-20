-- Migration 070: driver inbox dismissals (server-side delete)
CREATE TABLE IF NOT EXISTS driver_message_dismissals (
  fleet_driver_id TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fleet_driver_id, message_id)
);
