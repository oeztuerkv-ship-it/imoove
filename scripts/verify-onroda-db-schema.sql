-- Erwartetes PostgreSQL-Schema für die Onroda-API (Drizzle / Migrations 012–014).
-- Wird nach SQL-Migrationen ausgeführt; bricht mit RAISE ab, wenn Objekte fehlen.
-- Kein Ersatz für Migrationen — nur Absicherung gegen Tracker-/Restore-Drift.
--
-- Zuordnung (bei neuen Migrationen hier und ggf. in init-onroda.sql spiegeln):
--   012 → rides.access_code_normalized_snapshot
--   013 → rides.partner_booking_meta
--   014 → public.partner_ride_series

DO $$
DECLARE
  errs text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rides'
      AND column_name = 'access_code_normalized_snapshot'
  ) THEN
    errs := array_append(errs, 'rides.access_code_normalized_snapshot (Migration 012)');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rides'
      AND column_name = 'partner_booking_meta'
  ) THEN
    errs := array_append(errs, 'rides.partner_booking_meta (Migration 013)');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'partner_ride_series'
  ) THEN
    errs := array_append(errs, 'table partner_ride_series (Migration 014)');
  END IF;

  IF coalesce(array_length(errs, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'onroda_db_schema_verify_failed: fehlt % — Tracker-Einträge in onroda_deploy_migrations reichen nicht; fehlende Migration(en) mit psql -f …/artifacts/api-server/src/db/migrations/… ausführen, dann Deploy erneut.',
      array_to_string(errs, '; ');
  END IF;
END $$;
