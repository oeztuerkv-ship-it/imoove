-- Kunden-App: Expo Push Tokens pro Gerät (Re-Login weist Token dem aktuellen Passagier zu).
CREATE TABLE IF NOT EXISTS passenger_expo_push_tokens (
  expo_push_token TEXT PRIMARY KEY,
  passenger_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passenger_expo_push_tokens_passenger_id_idx
  ON passenger_expo_push_tokens (passenger_id);

COMMENT ON TABLE passenger_expo_push_tokens IS 'ExponentPushToken[] pro Gerät; Server sendet z. B. Reservierungs-Aktivierung / System-Storno.';
