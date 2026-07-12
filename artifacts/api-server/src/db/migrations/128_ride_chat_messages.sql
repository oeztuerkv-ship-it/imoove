-- Fahrt-Chat (Priorität A): persistierte Nachrichten pro Fahrt; kein dauerhafter Messaging-Kanal.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS chat_enabled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ride_chat_messages (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  sender_kind TEXT NOT NULL,
  sender_actor_id TEXT,
  body TEXT NOT NULL,
  client_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ride_chat_messages_sender_kind_chk
    CHECK (sender_kind IN ('booking_note', 'customer', 'partner', 'driver')),
  CONSTRAINT ride_chat_messages_body_len_chk
    CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS ride_chat_messages_ride_created_idx
  ON ride_chat_messages (ride_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS ride_chat_messages_client_dedupe_idx
  ON ride_chat_messages (ride_id, sender_actor_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

COMMENT ON COLUMN rides.chat_enabled IS
  'Zwei-Wege-Chat aktiv (Snapshot bei Annahme durch A-Fahrer); strikt fahrtgebunden.';

COMMENT ON TABLE ride_chat_messages IS
  'Chat-Nachrichten pro Fahrt; Historie bleibt nach Terminal-Status, Senden ist gesperrt.';
