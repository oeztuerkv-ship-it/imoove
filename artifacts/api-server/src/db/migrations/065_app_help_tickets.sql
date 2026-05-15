-- Allgemeine Hilfe-Anfragen aus der Kunden-App (ohne Fahrtbezug)
CREATE TABLE IF NOT EXISTS app_help_tickets (
  id TEXT PRIMARY KEY,
  passenger_id TEXT NOT NULL,
  passenger_name TEXT,
  passenger_email TEXT NOT NULL,
  passenger_phone TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  internal_note TEXT,
  source TEXT NOT NULL DEFAULT 'mobile_help',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_help_tickets_passenger_created_idx
  ON app_help_tickets (passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_help_tickets_status_created_idx
  ON app_help_tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS app_help_tickets_email_created_idx
  ON app_help_tickets (passenger_email, created_at DESC);
