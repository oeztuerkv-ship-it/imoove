-- Entfernt nur die QA-Seed-Fahrten (REQ-QA-NET-<seed_tag>-*).
-- Settlements/Invoices der Abnahme werden NICHT gelöscht.
--
--   psql "$DATABASE_URL" -v seed_tag=netting-qa-YYYYMMDD \
--     -f scripts/runbooks/sql/cleanup-taxi-cash-negativsaldo-week.sql

\set ON_ERROR_STOP on

DELETE FROM ride_financials
WHERE ride_id LIKE 'REQ-QA-NET-' || :'seed_tag' || '-%';

DELETE FROM rides
WHERE id LIKE 'REQ-QA-NET-' || :'seed_tag' || '-%';

SELECT 'cleaned seed rides for tag ' || :'seed_tag' AS result;
