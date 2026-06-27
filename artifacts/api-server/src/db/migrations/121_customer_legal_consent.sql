-- Kunden-AGB/Datenschutz-Zustimmung (E-Mail-Registrierung + OAuth passenger_profiles)

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS privacy_version TEXT NOT NULL DEFAULT '';

ALTER TABLE passenger_profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS privacy_version TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN customer_accounts.terms_accepted_at IS 'Zeitpunkt AGB-Zustimmung bei Kontoerstellung.';
COMMENT ON COLUMN customer_accounts.privacy_version IS 'Version der Datenschutzerklärung (stand_label|updated_at aus legal_pages).';
COMMENT ON COLUMN passenger_profiles.terms_accepted_at IS 'Zeitpunkt AGB-Zustimmung (OAuth oder E-Mail passenger_id).';
