-- Kund*innen-Support pro Fahrt: unveränderbarer Fahrtkontext + Ticket-Metadaten (MVP)
CREATE TABLE IF NOT EXISTS ride_support_tickets (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  passenger_id TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  internal_note TEXT,
  ride_context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_schema_version INTEGER NOT NULL DEFAULT 1,
  snapshot_captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_support_tickets_ride_idx
  ON ride_support_tickets (ride_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_support_tickets_passenger_idx
  ON ride_support_tickets (passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_support_tickets_status_idx
  ON ride_support_tickets (status, created_at DESC);
