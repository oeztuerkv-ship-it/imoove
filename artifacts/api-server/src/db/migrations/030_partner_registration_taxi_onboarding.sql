-- Taxi-Onboarding: strukturierte Stammdaten in der Partner-Registrierungsanfrage
ALTER TABLE partner_registration_requests
  ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_line2 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dispo_phone TEXT NOT NULL DEFAULT '';
