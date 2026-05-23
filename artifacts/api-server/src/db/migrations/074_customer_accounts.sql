-- Kundenkonten (E-Mail + Passwort), getrennt von Google-OAuth (sub = Google-ID ohne Zeile hier).
CREATE TABLE IF NOT EXISTS customer_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email_verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_email_uq ON customer_accounts (email);

CREATE INDEX IF NOT EXISTS customer_accounts_created_at_idx ON customer_accounts (created_at DESC);
