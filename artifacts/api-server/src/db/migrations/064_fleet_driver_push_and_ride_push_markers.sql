-- Fahrer-App: Expo Push Tokens (Mandant + Fahrer-ID)
CREATE TABLE IF NOT EXISTS fleet_driver_expo_push_tokens (
  expo_push_token TEXT PRIMARY KEY,
  fleet_driver_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fleet_driver_expo_push_tokens_driver_company_idx
  ON fleet_driver_expo_push_tokens (fleet_driver_id, company_id);

COMMENT ON TABLE fleet_driver_expo_push_tokens IS 'ExponentPushToken pro Gerät; Zuordnung zu fleet_drivers.id + company_id.';

-- Push-Dedupe / einmalige Kunden- und Fahrer-Hinweise pro Fahrt
ALTER TABLE rides ADD COLUMN IF NOT EXISTS push_customer_reservation_assigned_at TIMESTAMPTZ NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS push_driver_activation_reminder_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN rides.push_customer_reservation_assigned_at IS 'Kunde: Push „Reservierung bestätigt“ gesendet.';
COMMENT ON COLUMN rides.push_driver_activation_reminder_at IS 'Fahrer: Push „Bitte aktivieren“ (ca. 45 Min. vor Abholung) gesendet.';
