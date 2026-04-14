CREATE TABLE IF NOT EXISTS ride_events (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_events_ride_created_idx ON ride_events (ride_id, created_at DESC);
