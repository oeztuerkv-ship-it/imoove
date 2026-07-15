-- Kunden-PIN zur Fahrgast-Verifizierung bei Ankunft (App-Kundenfahrten)

ALTER TABLE passenger_profiles
  ADD COLUMN IF NOT EXISTS ride_verify_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS ride_verify_pin_enc TEXT,
  ADD COLUMN IF NOT EXISTS ride_verify_pin_set_at TIMESTAMPTZ;

COMMENT ON COLUMN passenger_profiles.ride_verify_pin_hash IS 'scrypt-Hash des 4-stelligen Abhol-PINs (Fahrer-Verify).';
COMMENT ON COLUMN passenger_profiles.ride_verify_pin_enc IS 'AES-GCM-Cipher des PINs nur für Anzeige an den Kontoinhaber.';
COMMENT ON COLUMN passenger_profiles.ride_verify_pin_set_at IS 'Zeitpunkt der letzten PIN-Setzung/Auto-Vergabe.';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS passenger_pin_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN rides.passenger_pin_verified_at IS 'Fahrer hat Kunden-PIN bei Ankunft verifiziert (nur App-Direktfahrten).';
