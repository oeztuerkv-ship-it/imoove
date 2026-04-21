-- Partner-Panel: Stammdaten-Self-Service nach erstem vollständigen Satz sperren (weitere Änderungen nur per Change-Request).
ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS partner_panel_profile_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Bestehende Mandanten mit vollständig befüllten Basis-Stammdaten wie im Partner-UI (Profil „Lücken“) behandeln.
UPDATE admin_companies
SET partner_panel_profile_locked = TRUE
WHERE
  trim(coalesce(name, '')) <> ''
  AND trim(coalesce(contact_name, '')) <> ''
  AND trim(coalesce(email, '')) <> ''
  AND trim(coalesce(phone, '')) <> ''
  AND trim(coalesce(address_line1, '')) <> ''
  AND trim(coalesce(address_line2, '')) <> ''
  AND trim(coalesce(postal_code, '')) <> ''
  AND trim(coalesce(city, '')) <> ''
  AND trim(coalesce(country, '')) <> ''
  AND trim(coalesce(legal_form, '')) <> ''
  AND trim(coalesce(owner_name, '')) <> '';
