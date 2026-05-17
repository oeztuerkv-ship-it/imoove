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
--   046 → fleet_vehicles.admin_internal_note, block_reason, model_year, passenger_seats
--   048 → fleet_drivers.readiness_override_system (Operator-Tests)
--   049 → app_operational_config, app_service_regions (App/Betrieb MVP)
--   050 → rides.customer_phone, app_service_regions.match_mode, geo_fence_json
--   052 → app_service_regions center_lat, center_lng, radius_km
--   053 → rides.accessibility_options_json
--   054 → email_verification_codes (Kunden-E-Mail-Codes)
--   056 → fleet_drivers.home_address, drivers_license_* (Partner, optional)
--   066 → fleet_drivers.is_market_online (Fleet-App Markt ONLINE/OFFLINE)
--   057 → app_news_items (Mobile Neuigkeiten, Admin-CMS)
--   059 → ride_support_tickets erweitert (company_id, priority, source, Actor-Felder)
--   060 → medical_document_extractions (OCR-Struktur ohne API-Pflicht)
--   061 → settlements.idempotency_key, settlement_ride_allocations, payments partial unique
--   063 → passenger_expo_push_tokens (Kunden-Expo-Push)
--   064 → fleet_driver_expo_push_tokens + rides.push_*_at (Push-Dedupe)
--   065 → app_help_tickets (Kunden-App Tab Hilfe)

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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'accessibility_options_json'
  ) THEN
    errs := array_append(errs, 'rides.accessibility_options_json (Migration 053)');
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
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'readiness_override_system'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.readiness_override_system (Migration 048)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'home_address'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.home_address (Migration 056)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'drivers_license_number'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.drivers_license_number (Migration 056)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'drivers_license_expiry'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.drivers_license_expiry (Migration 056)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_drivers' AND column_name = 'is_market_online'
  ) THEN
    errs := array_append(errs, 'fleet_drivers.is_market_online (Migration 066)');
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
    WHERE table_schema = 'public' AND table_name = 'fleet_vehicles' AND column_name = 'admin_internal_note'
  ) THEN
    errs := array_append(errs, 'fleet_vehicles.admin_internal_note (Migration 046 o. init-onroda)');
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

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_operational_config'
  ) THEN
    errs := array_append(errs, 'table app_operational_config (Migration 049)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_service_regions'
  ) THEN
    errs := array_append(errs, 'table app_service_regions (Migration 049)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'customer_phone'
  ) THEN
    errs := array_append(errs, 'rides.customer_phone (Migration 050)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_service_regions' AND column_name = 'match_mode'
  ) THEN
    errs := array_append(errs, 'app_service_regions.match_mode (Migration 050)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_service_regions' AND column_name = 'geo_fence_json'
  ) THEN
    errs := array_append(errs, 'app_service_regions.geo_fence_json (Migration 050)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'tariff_snapshot_json'
  ) THEN
    errs := array_append(errs, 'rides.tariff_snapshot_json (Migration 051)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_service_regions' AND column_name = 'center_lat'
  ) THEN
    errs := array_append(errs, 'app_service_regions.center_lat (Migration 052)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_service_regions' AND column_name = 'center_lng'
  ) THEN
    errs := array_append(errs, 'app_service_regions.center_lng (Migration 052)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_service_regions' AND column_name = 'radius_km'
  ) THEN
    errs := array_append(errs, 'app_service_regions.radius_km (Migration 052)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_verification_codes'
  ) THEN
    errs := array_append(errs, 'table email_verification_codes (Migration 054)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_verification_codes' AND column_name = 'code_hash'
  ) THEN
    errs := array_append(errs, 'email_verification_codes.code_hash (Migration 054)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_news_items'
  ) THEN
    errs := array_append(errs, 'table app_news_items (Migration 057)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_news_items' AND column_name = 'target_type'
  ) THEN
    errs := array_append(errs, 'app_news_items.target_type (Migration 057)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ride_support_tickets'
  ) THEN
    errs := array_append(errs, 'table ride_support_tickets (Migration 047)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_support_tickets' AND column_name = 'ride_context_snapshot'
  ) THEN
    errs := array_append(errs, 'ride_support_tickets.ride_context_snapshot (Migration 047)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_support_tickets' AND column_name = 'company_id'
  ) THEN
    errs := array_append(errs, 'ride_support_tickets.company_id (Migration 059)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_support_tickets' AND column_name = 'priority'
  ) THEN
    errs := array_append(errs, 'ride_support_tickets.priority (Migration 059)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ride_support_tickets' AND column_name = 'created_by_actor_kind'
  ) THEN
    errs := array_append(errs, 'ride_support_tickets.created_by_actor_kind (Migration 059)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'medical_document_extractions'
  ) THEN
    errs := array_append(errs, 'table medical_document_extractions (Migration 060)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'medical_document_extractions' AND column_name = 'extraction_json'
  ) THEN
    errs := array_append(errs, 'medical_document_extractions.extraction_json (Migration 060)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settlements' AND column_name = 'idempotency_key'
  ) THEN
    errs := array_append(errs, 'settlements.idempotency_key (Migration 061)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'settlement_ride_allocations'
  ) THEN
    errs := array_append(errs, 'table settlement_ride_allocations (Migration 061)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'settlement_ride_allocations_one_ride_global'
  ) THEN
    errs := array_append(errs, 'index settlement_ride_allocations_one_ride_global (Migration 061)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_settlement_single_open'
  ) THEN
    errs := array_append(errs, 'index payments_settlement_single_open (Migration 061)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'passenger_expo_push_tokens'
  ) THEN
    errs := array_append(errs, 'table passenger_expo_push_tokens (Migration 063)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'passenger_expo_push_tokens' AND column_name = 'passenger_id'
  ) THEN
    errs := array_append(errs, 'passenger_expo_push_tokens.passenger_id (Migration 063)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'passenger_expo_push_tokens_passenger_id_idx'
  ) THEN
    errs := array_append(errs, 'index passenger_expo_push_tokens_passenger_id_idx (Migration 063)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fleet_driver_expo_push_tokens'
  ) THEN
    errs := array_append(errs, 'table fleet_driver_expo_push_tokens (Migration 064)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fleet_driver_expo_push_tokens' AND column_name = 'fleet_driver_id'
  ) THEN
    errs := array_append(errs, 'fleet_driver_expo_push_tokens.fleet_driver_id (Migration 064)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'fleet_driver_expo_push_tokens_driver_company_idx'
  ) THEN
    errs := array_append(errs, 'index fleet_driver_expo_push_tokens_driver_company_idx (Migration 064)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'push_customer_reservation_assigned_at'
  ) THEN
    errs := array_append(errs, 'rides.push_customer_reservation_assigned_at (Migration 064)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'push_driver_activation_reminder_at'
  ) THEN
    errs := array_append(errs, 'rides.push_driver_activation_reminder_at (Migration 064)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_help_tickets'
  ) THEN
    errs := array_append(errs, 'table app_help_tickets (Migration 065)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_help_tickets' AND column_name = 'message'
  ) THEN
    errs := array_append(errs, 'app_help_tickets.message (Migration 065)');
  END IF;

  IF coalesce(array_length(errs, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'onroda_db_schema_verify_failed: fehlt % — Tracker-Einträge in onroda_deploy_migrations reichen nicht; fehlende Migration(en) mit psql -f …/artifacts/api-server/src/db/migrations/… ausführen (siehe MIGRATION_ORDER.txt), dann Deploy erneut.',
      array_to_string(errs, '; ');
  END IF;
END $$;
