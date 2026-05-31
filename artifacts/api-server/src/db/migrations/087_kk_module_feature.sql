-- KK-Modul (bezahltes SaaS-Abo): Mandanten-Feature-Flag + Fahrer-Berechtigungen
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 087_kk_module_feature.sql

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS feature_kk_module BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS feature_kk_module_since TIMESTAMPTZ;

COMMENT ON COLUMN admin_companies.feature_kk_module IS
  'KK-Modul (Krankenfahrten/Sammelrechnung/Transportschein) für Taxi-Mandanten — kommerzielles SaaS-Abo.';

COMMENT ON COLUMN admin_companies.feature_kk_module_since IS
  'Zeitpunkt der letzten Aktivierung des KK-Moduls (NULL wenn deaktiviert).';

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS permission_kk_module BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN fleet_drivers.permission_kk_module IS
  'KK-Modul-Zugriff für Mitarbeiter-Fahrer (Inhaber: is_owner=true, siehe kkModuleAccess).';

COMMENT ON COLUMN fleet_drivers.is_owner IS
  'Inhaber-Fahrerkonto — voller KK-Modul-Zugriff wenn Mandant feature_kk_module hat.';

-- Bestehende Inhaber: Panel-Owner-E-Mail = Fahrer-E-Mail
UPDATE fleet_drivers fd
SET is_owner = true
FROM panel_users pu
WHERE pu.company_id = fd.company_id
  AND pu.role = 'owner'
  AND pu.is_active = true
  AND lower(trim(pu.email)) = lower(trim(fd.email));

-- Fallback: erster Fahrer pro Mandant ohne Owner-Zuordnung
UPDATE fleet_drivers fd
SET is_owner = true
FROM (
  SELECT DISTINCT ON (company_id) id
  FROM fleet_drivers d0
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet_drivers d1
    WHERE d1.company_id = d0.company_id AND d1.is_owner = true
  )
  ORDER BY company_id, created_at ASC NULLS LAST, id ASC
) first_driver
WHERE fd.id = first_driver.id;
