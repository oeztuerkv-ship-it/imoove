-- =============================================================================
-- Onroda: Mandanten-Wipe — Partner, Fahrten, Kunden; ein Admin-Login bleibt
-- =============================================================================
--
-- VORHER: Backup (pg_dump). Nur auf der gewollten Datenbank ausführen.
--
-- Ausführung (empfohlen):
--   ONRODA_KEEP_ADMIN_LOGIN=dein_admin_user ONRODA_CONFIRM_WIPE=1 ./scripts/run-onroda-wipe-tenants.sh
--
-- Manuell (psql-Variable Pflicht):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v keep_login=dein_admin_user -f scripts/onroda-wipe-tenants-keep-one-admin.sql
--
-- Bleibt u. a.: admin_auth_users (1 Zeile), fare_areas, app_operational_config,
-- homepage_*, app_news_items, app_faq, app_sponsors, app_service_regions.
-- =============================================================================

\if :{?keep_login}
\else
\echo 'FEHLER: keep_login fehlt. Nutze scripts/run-onroda-wipe-tenants.sh oder: psql -v keep_login=DEIN_ADMIN_USER ...'
\quit 1
\endif

BEGIN;

-- Muss innerhalb derselben Transaktion wie die DO-Blöcke/DELETEs stehen (set_config mit is_local=true vor BEGIN wäre verloren).
SELECT set_config('onroda.wipe.keep_login', :'keep_login', true);

DO $$
DECLARE
  keep_login constant text := current_setting('onroda.wipe.keep_login', true);
  n int;
BEGIN
  IF keep_login IS NULL OR btrim(keep_login) = '' THEN
    RAISE EXCEPTION 'keep_login ist leer — psql -v keep_login=admin_username setzen.';
  END IF;
  SELECT count(*)::int INTO n FROM admin_auth_users WHERE lower(username) = lower(keep_login);
  IF n <> 1 THEN
    RAISE EXCEPTION 'admin_auth_users: für Login % erwartet genau 1 Zeile, gefunden %', keep_login, n;
  END IF;
END $$;

-- Push / Meldungen
DELETE FROM fleet_driver_expo_push_tokens;
DELETE FROM passenger_expo_push_tokens;
DELETE FROM driver_message_dismissals;
DELETE FROM driver_messages;
DELETE FROM partner_messages;

-- Fahrten (Kinder zuerst)
DELETE FROM ride_driver_dispatch_offers;
DELETE FROM ride_driver_locations;
DELETE FROM medical_reviews;
DELETE FROM medical_documents;
DELETE FROM medical_cases;
DELETE FROM customer_medical_transport_scans;
DELETE FROM medical_document_extractions;
DELETE FROM transport_vouchers;
DELETE FROM insurer_ride_transport_documents;
DELETE FROM settlement_ride_allocations;
DELETE FROM payments;
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM settlements;
DELETE FROM financial_audit_log;
DELETE FROM ride_billing_corrections;
DELETE FROM billing_export_batches;
DELETE FROM ride_financials;
DELETE FROM ride_events;
DELETE FROM ride_support_tickets;
DELETE FROM rides;

DELETE FROM access_codes;
DELETE FROM app_help_tickets;

-- Partner-Anfragen (E-Mails in Anfragen/Panel/Fleet)
DELETE FROM partner_registration_timeline;
DELETE FROM partner_registration_documents;
DELETE FROM partner_registration_requests;

DELETE FROM support_messages;
DELETE FROM support_threads;

DELETE FROM company_change_requests;
DELETE FROM panel_audit_log;
DELETE FROM partner_ride_series;

DELETE FROM company_documents;
DELETE FROM company_vehicles;
DELETE FROM company_compliance_documents;

DELETE FROM driver_vehicle_assignments;
DELETE FROM fleet_drivers;
DELETE FROM fleet_vehicles;

DELETE FROM insurer_cost_centers;
DELETE FROM billing_accounts;
DELETE FROM invoice_number_sequences;

-- Kranken-Rechnungen (falls Migration 086)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kranken_invoice_items') THEN
    EXECUTE 'DELETE FROM kranken_invoice_items';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kranken_invoices') THEN
    EXECUTE 'DELETE FROM kranken_invoices';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kranken_invoice_sequences') THEN
    EXECUTE 'DELETE FROM kranken_invoice_sequences';
  END IF;
END $$;

DELETE FROM panel_users;
DELETE FROM email_verification_codes;
DELETE FROM customer_accounts;
DELETE FROM admin_companies;

DELETE FROM admin_auth_password_resets
WHERE admin_user_id IN (
  SELECT id FROM admin_auth_users
  WHERE lower(username) <> lower(current_setting('onroda.wipe.keep_login', true))
);

DELETE FROM admin_auth_audit_log;

DELETE FROM admin_auth_users
WHERE lower(username) <> lower(current_setting('onroda.wipe.keep_login', true));

DO $$
DECLARE
  n_companies int;
  n_panel int;
  n_rides int;
  n_fleet int;
  n_customers int;
  n_admins int;
BEGIN
  SELECT count(*)::int INTO n_companies FROM admin_companies;
  SELECT count(*)::int INTO n_panel FROM panel_users;
  SELECT count(*)::int INTO n_rides FROM rides;
  SELECT count(*)::int INTO n_fleet FROM fleet_drivers;
  SELECT count(*)::int INTO n_customers FROM customer_accounts;
  SELECT count(*)::int INTO n_admins FROM admin_auth_users;
  IF n_companies <> 0 OR n_panel <> 0 OR n_rides <> 0 OR n_fleet <> 0 OR n_customers <> 0 OR n_admins <> 1 THEN
    RAISE EXCEPTION 'Wipe unvollständig: companies=%, panel=%, rides=%, fleet_drivers=%, customers=%, admin_auth_users=%',
      n_companies, n_panel, n_rides, n_fleet, n_customers, n_admins;
  END IF;
END $$;

COMMIT;
