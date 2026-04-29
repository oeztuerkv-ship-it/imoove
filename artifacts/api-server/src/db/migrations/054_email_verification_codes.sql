-- E-Mail-Verifizierung (Kunden-Onboarding): 6-stellige Codes nur gehasht, TTL auf Anwendungsseite.
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_codes_email_purpose_created_idx
  ON email_verification_codes (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS email_verification_codes_email_recent_idx
  ON email_verification_codes (email, created_at DESC);
