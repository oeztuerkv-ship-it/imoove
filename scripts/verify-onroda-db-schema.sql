-- Erwartetes PostgreSQL-Schema für die Onroda-API (Drizzle / Migrations 006–014).
-- Wird nach SQL-Migrationen ausgeführt; bricht mit RAISE ab, wenn Objekte fehlen.
-- Kein Ersatz für Migrationen — nur Absicherung gegen Tracker-/Restore-Drift.
--
-- Zuordnung (bei neuen Migrationen hier und ggf. in init-onroda.sql spiegeln):
--   006 → u. a. rides.scheduled_at
--   008 → rides.ride_kind, payer_kind, voucher_code, billing_reference
--   009 → access_codes + rides.authorization_source, access_code_id
--   012 → rides.access_code_normalized_snapshot
--   013 → rides.partner_booking_meta
--   014 → public.partner_ride_series
--   016 → panel_users.must_change_password
--   017 → fare_areas pricing fields
--   018 → admin_auth_users (Admin-Login + Passwortwechsel)
--   019 → admin_auth_password_resets + admin_auth_audit_log + session_version

DO $$
DECLARE
  errs text[] := ARRAY[]::text[];
BEGIN
  -- rides: Kernspalten für Panel-Liste / Drizzle (häufige Produktionslücken)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'scheduled_at'
  ) THEN
    errs := array_append(errs, 'rides.scheduled_at (Migration 006 o. init-onroda)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'ride_kind'
  ) THEN
    errs := array_append(errs, 'rides.ride_kind (Migration 008)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'payer_kind'
  ) THEN
    errs := array_append(errs, 'rides.payer_kind (Migration 008)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'voucher_code'
  ) THEN
    errs := array_append(errs, 'rides.voucher_code (Migration 008)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'billing_reference'
  ) THEN
    errs := array_append(errs, 'rides.billing_reference (Migration 008)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'authorization_source'
  ) THEN
    errs := array_append(errs, 'rides.authorization_source (Migration 009)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'access_code_id'
  ) THEN
    errs := array_append(errs, 'rides.access_code_id (Migration 009)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'access_codes'
  ) THEN
    errs := array_append(errs, 'table access_codes (Migration 009)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_codes' AND column_name = 'lifecycle_status'
  ) THEN
    errs := array_append(errs, 'access_codes.lifecycle_status (Migration 013)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_codes' AND column_name = 'reserved_ride_id'
  ) THEN
    errs := array_append(errs, 'access_codes.reserved_ride_id (Migration 013)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'access_code_normalized_snapshot'
  ) THEN
    errs := array_append(errs, 'rides.access_code_normalized_snapshot (Migration 012)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'partner_booking_meta'
  ) THEN
    errs := array_append(errs, 'rides.partner_booking_meta (Migration 013)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'partner_ride_series'
  ) THEN
    errs := array_append(errs, 'table partner_ride_series (Migration 014)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'panel_users' AND column_name = 'must_change_password'
  ) THEN
    errs := array_append(errs, 'panel_users.must_change_password (Migration 016)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fare_areas' AND column_name = 'base_fare_eur'
  ) THEN
    errs := array_append(errs, 'fare_areas.base_fare_eur (Migration 017)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_auth_users'
  ) THEN
    errs := array_append(errs, 'table admin_auth_users (Migration 018)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_auth_users' AND column_name = 'session_version'
  ) THEN
    errs := array_append(errs, 'admin_auth_users.session_version (Migration 019)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_auth_users' AND column_name = 'scope_company_id'
  ) THEN
    errs := array_append(errs, 'admin_auth_users.scope_company_id (Migration 021)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_auth_password_resets'
  ) THEN
    errs := array_append(errs, 'table admin_auth_password_resets (Migration 019)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_auth_audit_log'
  ) THEN
    errs := array_append(errs, 'table admin_auth_audit_log (Migration 019)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_companies' AND column_name = 'company_kind'
  ) THEN
    errs := array_append(errs, 'admin_companies.company_kind (Migration 022)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers'
  ) THEN
    errs := array_append(errs, 'table fleet_drivers (Migration 022)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles'
  ) THEN
    errs := array_append(errs, 'table fleet_vehicles (Migration 022)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_vehicle_assignments'
  ) THEN
    errs := array_append(errs, 'table driver_vehicle_assignments (Migration 022)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_companies' AND column_name = 'verification_status'
  ) THEN
    errs := array_append(errs, 'admin_companies.verification_status (Migration 023)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_companies' AND column_name = 'max_drivers'
  ) THEN
    errs := array_append(errs, 'admin_companies.max_drivers (Migration 023)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_change_requests'
  ) THEN
    errs := array_append(errs, 'table company_change_requests (Migration 023)');
  END IF;

  IF coalesce(array_length(errs, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'onroda_db_schema_verify_failed: fehlt % — Tracker-Einträge in onroda_deploy_migrations reichen nicht; fehlende Migration(en) mit psql -f …/artifacts/api-server/src/db/migrations/… ausführen (siehe MIGRATION_ORDER.txt), dann Deploy erneut.',
      array_to_string(errs, '; ');
  END IF;
END $$;
