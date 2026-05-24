-- Krankenfahrt-Freigabe: ONRODA-Admin schaltet Unternehmen + optional Fahrer-Override frei.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 076_medical_transport_authorization.sql

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS medical_transport_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN admin_companies.medical_transport_enabled IS
  'ONRODA-Admin: Krankenfahrten und Transportschein-Scanner für diesen Mandanten.';

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS medical_transport_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS medical_transport_inherit_from_company BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN fleet_drivers.medical_transport_enabled IS
  'ONRODA-Admin: Fahrer-Override für Krankenfahrten; wirksam wenn medical_transport_inherit_from_company=false.';

COMMENT ON COLUMN fleet_drivers.medical_transport_inherit_from_company IS
  'true = Fahrer erbt medical_transport_enabled vom Unternehmen (admin_companies).';
