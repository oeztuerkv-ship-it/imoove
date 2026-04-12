-- Zentrale Zugangscodes: digitale Kostenübernahme / Freigabe durch Auftraggeber (Firma, Hotel, …), kein Papier.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/009_access_codes_and_ride_authorization.sql

CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  code_normalized TEXT NOT NULL UNIQUE,
  code_type TEXT NOT NULL,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_codes_company_id_idx ON access_codes (company_id);

COMMENT ON TABLE access_codes IS 'Digitale Freigabe/Kostenübernahme; code_type klassifiziert Kanal; company_id = Abrechnungs-Mandant';
COMMENT ON COLUMN access_codes.company_id IS 'Kostenträger (admin_companies); NULL = global einlösbar, dann payer_kind third_party auf der Fahrt';
COMMENT ON COLUMN access_codes.meta IS 'Optional: z. B. interne Vorgangsnummer, Hinweis „für Person X“ (nur Verwaltung, keine Pflicht)';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS authorization_source TEXT NOT NULL DEFAULT 'passenger_direct',
  ADD COLUMN IF NOT EXISTS access_code_id TEXT REFERENCES access_codes (id) ON DELETE SET NULL;

COMMENT ON COLUMN rides.authorization_source IS 'passenger_direct | access_code (digitale Kostenübernahme)';
COMMENT ON COLUMN rides.access_code_id IS 'Ein gelöster Freigabe-Code; Nachvollziehbarkeit zur Abrechnung';
COMMENT ON COLUMN rides.final_fare IS 'Realer Fahrpreis nach Abschluss; bei access_code + company_id Abrechnungsbetrag gegen Mandanten';
