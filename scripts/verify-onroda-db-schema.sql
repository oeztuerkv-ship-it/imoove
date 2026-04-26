-- Erwartetes PostgreSQL-Schema für die Onroda-API (Drizzle / nummerierte SQL-Migrationen).
-- Wird nach SQL-Migrationen ausgeführt; bricht mit RAISE ab, wenn Objekte fehlen.
-- Kein Ersatz für Migrationen — nur Absicherung gegen Tracker-/Restore-Drift.
-- Vollständige Reihenfolge: artifacts/api-server/src/db/migrations/MIGRATION_ORDER.txt
--
-- Zuordnung (Auszug — bei neuen Migrationen hier und ggf. in init-onroda.sql spiegeln):
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
--   022 → Taxi-Flotte (fleet_drivers, fleet_vehicles, …)
--   023 → Governance + company_change_requests
--   024 → ride_events (Status-Historie pro Fahrt)
--   025 → partner_registration_requests (Unternehmensanfragen)
--   026 → partner_registration_documents + partner_registration_timeline
--   027 → fleet vehicle legal/class + rides.pricing_mode
--   028 → financial core tables (billing_accounts, ride_financials, invoices, settlements, payments, audit)
--   033 → company_compliance_documents
--   034 → support_threads, support_messages
--   035 → fleet_vehicles.approval_status, konzession_number, vehicle_documents, …
--   036 → billing_export_batches, ride_billing_corrections (Krankenkassen-Modus)
--   038 → homepage_content (Homepage-CMS MVP)
--   039 → homepage_content.section2_title, homepage_content.section2_cards
--   040 → homepage_content (services_*, manifest_*)
--   041 → insurer_cost_centers, insurer_ride_transport_documents
--   042 → homepage_faq_items, homepage_how_steps, homepage_trust_metrics
--   044 → fleet_drivers.approval_status
--   045 → fleet_drivers.suspension_reason, admin_internal_note

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
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'vehicle_legal_type'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.vehicle_legal_type (Migration 027)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'vehicle_class'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.vehicle_class (Migration 027)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'approval_status'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.approval_status (Migration 044)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'suspension_reason'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.suspension_reason (Migration 045)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'admin_internal_note'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.admin_internal_note (Migration 045)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'vehicle_legal_type'
  ) THEN
    errs := array_append(errs, 'fleet_vehicles.vehicle_legal_type (Migration 027)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'vehicle_class'
  ) THEN
    errs := array_append(errs, 'fleet_vehicles.vehicle_class (Migration 027)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'approval_status'
  ) THEN
    errs := array_append(errs, 'fleet_vehicles.approval_status (Migration 035)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'konzession_number'
  ) THEN
    errs := array_append(errs, 'fleet_vehicles.konzession_number (Migration 035)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'pricing_mode'
  ) THEN
    errs := array_append(errs, 'rides.pricing_mode (Migration 027)');
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_companies' AND column_name = 'partner_panel_profile_locked'
  ) THEN
    errs := array_append(errs, 'admin_companies.partner_panel_profile_locked (Migration 031)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_compliance_documents'
  ) THEN
    errs := array_append(errs, 'table company_compliance_documents (Migration 033)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_threads'
  ) THEN
    errs := array_append(errs, 'table support_threads (Migration 034)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_messages'
  ) THEN
    errs := array_append(errs, 'table support_messages (Migration 034)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_change_requests'
  ) THEN
    errs := array_append(errs, 'table company_change_requests (Migration 023)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ride_events'
  ) THEN
    errs := array_append(errs, 'table ride_events (Migration 024)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'partner_registration_requests'
  ) THEN
    errs := array_append(errs, 'table partner_registration_requests (Migration 025)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'partner_registration_documents'
  ) THEN
    errs := array_append(errs, 'table partner_registration_documents (Migration 026)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'partner_registration_timeline'
  ) THEN
    errs := array_append(errs, 'table partner_registration_timeline (Migration 026)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_registration_requests' AND column_name = 'owner_name'
  ) THEN
    errs := array_append(errs, 'partner_registration_requests.owner_name (Migration 030)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_registration_requests' AND column_name = 'address_line2'
  ) THEN
    errs := array_append(errs, 'partner_registration_requests.address_line2 (Migration 030)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_registration_requests' AND column_name = 'dispo_phone'
  ) THEN
    errs := array_append(errs, 'partner_registration_requests.dispo_phone (Migration 030)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_accounts'
  ) THEN
    errs := array_append(errs, 'table billing_accounts (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ride_financials'
  ) THEN
    errs := array_append(errs, 'table ride_financials (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_financials' AND column_name = 'calculation_version'
  ) THEN
    errs := array_append(errs, 'ride_financials.calculation_version (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_financials' AND column_name = 'calculation_rule_set'
  ) THEN
    errs := array_append(errs, 'ride_financials.calculation_rule_set (Migration 029)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_financials' AND column_name = 'calculation_metadata_json'
  ) THEN
    errs := array_append(errs, 'ride_financials.calculation_metadata_json (Migration 029)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_financials' AND column_name = 'lock_reason'
  ) THEN
    errs := array_append(errs, 'ride_financials.lock_reason (Migration 029)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_financials' AND column_name = 'correction_count'
  ) THEN
    errs := array_append(errs, 'ride_financials.correction_count (Migration 029)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) THEN
    errs := array_append(errs, 'table invoices (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'invoice_number'
  ) THEN
    errs := array_append(errs, 'invoices.invoice_number (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoice_items'
  ) THEN
    errs := array_append(errs, 'table invoice_items (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'settlements'
  ) THEN
    errs := array_append(errs, 'table settlements (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    errs := array_append(errs, 'table payments (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'financial_audit_log'
  ) THEN
    errs := array_append(errs, 'table financial_audit_log (Migration 028)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_export_batches'
  ) THEN
    errs := array_append(errs, 'table billing_export_batches (Migration 036)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ride_billing_corrections'
  ) THEN
    errs := array_append(errs, 'table ride_billing_corrections (Migration 036)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'homepage_content'
  ) THEN
    errs := array_append(errs, 'table homepage_content (Migration 038)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'homepage_content' AND column_name = 'section2_title'
  ) THEN
    errs := array_append(errs, 'homepage_content.section2_title (Migration 039)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'homepage_content' AND column_name = 'section2_cards'
  ) THEN
    errs := array_append(errs, 'homepage_content.section2_cards (Migration 039)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'homepage_content' AND column_name = 'services_kicker'
  ) THEN
    errs := array_append(errs, 'homepage_content.services_kicker (Migration 040)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'homepage_content' AND column_name = 'manifest_cards'
  ) THEN
    errs := array_append(errs, 'homepage_content.manifest_cards (Migration 040)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'insurer_cost_centers'
  ) THEN
    errs := array_append(errs, 'table insurer_cost_centers (Migration 041)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'insurer_ride_transport_documents'
  ) THEN
    errs := array_append(errs, 'table insurer_ride_transport_documents (Migration 041)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'homepage_faq_items'
  ) THEN
    errs := array_append(errs, 'table homepage_faq_items (Migration 042)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'homepage_how_steps'
  ) THEN
    errs := array_append(errs, 'table homepage_how_steps (Migration 042)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'homepage_trust_metrics'
  ) THEN
    errs := array_append(errs, 'table homepage_trust_metrics (Migration 042)');
  END IF;

  IF coalesce(array_length(errs, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'onroda_db_schema_verify_failed: fehlt % — Tracker-Einträge in onroda_deploy_migrations reichen nicht; fehlende Migration(en) mit psql -f …/artifacts/api-server/src/db/migrations/… ausführen (siehe MIGRATION_ORDER.txt), dann Deploy erneut.',
      array_to_string(errs, '; ');
  END IF;
END $$;
