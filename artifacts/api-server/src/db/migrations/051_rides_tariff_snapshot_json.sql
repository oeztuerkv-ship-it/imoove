-- Tarif-Snapshot bei Buchung (gleiche Engine wie /fare-estimate), freeze für Abrechnung/Audit.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS tariff_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;
