-- Fahrer-Avatar: lokaler Storage-Key + Einwilligung Kundenanzeige.

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS avatar_storage_key text,
  ADD COLUMN IF NOT EXISTS avatar_show_to_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fleet_drivers.avatar_storage_key IS
  'Relativer Pfad unter FLEET_UPLOAD_DIR (z. B. co-…/drivers/…/avatar.jpg); NULL = kein Foto.';
COMMENT ON COLUMN fleet_drivers.avatar_show_to_customer IS
  'true = Foto darf Kunden bei zugewiesener Fahrt angezeigt werden (Privacy).';
