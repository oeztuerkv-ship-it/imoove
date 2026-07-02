-- Diagnose: Unternehmer-Zuordnung in Unternehmer-Auszahlungen (Admin)
-- Auf Produktion: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/diagnose-payout-company-resolution.sql
-- Optional eine Fahrt: psql "$DATABASE_URL" -v ride_id=REQ-1782939187270 -f ...

\echo '=== 1) Beispiel-Fahrt (oder :ride_id setzen) ==='
SELECT
  rf.ride_id,
  rf.service_provider_company_id,
  rf.partner_company_id,
  r.company_id AS rides_company_id,
  r.driver_id,
  r.status AS ride_status,
  fd.company_id AS fleet_driver_company_id,
  ac_sp.name AS sp_company_name,
  ac_r.name AS rides_company_name,
  ac_fd.name AS driver_company_name,
  COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id) AS coalesce_api_v1,
  COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id, fd.company_id) AS coalesce_with_driver
FROM ride_financials rf
LEFT JOIN rides r ON r.id = rf.ride_id
LEFT JOIN fleet_drivers fd ON fd.id = r.driver_id
LEFT JOIN admin_companies ac_sp ON ac_sp.id = rf.service_provider_company_id
LEFT JOIN admin_companies ac_r ON ac_r.id = r.company_id
LEFT JOIN admin_companies ac_fd ON ac_fd.id = fd.company_id
WHERE rf.ride_id = COALESCE(NULLIF(trim(:'ride_id'), ''), 'REQ-1782939187270');

\echo ''
\echo '=== 2) Gesamt ride_financials (Mandant-Auflösung) ==='
SELECT
  count(*) AS total_financials,
  count(*) FILTER (WHERE rf.service_provider_company_id IS NOT NULL) AS rf_has_service_provider,
  count(*) FILTER (WHERE rf.partner_company_id IS NOT NULL) AS rf_has_partner,
  count(*) FILTER (WHERE r.company_id IS NOT NULL AND trim(r.company_id) <> '') AS rides_has_company_id,
  count(*) FILTER (WHERE r.driver_id IS NOT NULL AND trim(r.driver_id) <> '') AS rides_has_driver_id,
  count(*) FILTER (WHERE fd.company_id IS NOT NULL) AS resolvable_via_fleet_driver,
  count(*) FILTER (
    WHERE COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id) IS NULL
  ) AS api_shows_dash_today,
  count(*) FILTER (
    WHERE COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id) IS NULL
      AND fd.company_id IS NOT NULL
  ) AS fixable_if_driver_join_added,
  count(*) FILTER (
    WHERE COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id, fd.company_id) IS NULL
  ) AS truly_unresolvable
FROM ride_financials rf
LEFT JOIN rides r ON r.id = rf.ride_id
LEFT JOIN fleet_drivers fd ON fd.id = r.driver_id;

\echo ''
\echo '=== 3) Migration-124-Wirkung (was hätte Backfill gefüllt?) ==='
SELECT
  count(*) AS still_null_sp_after_124,
  count(*) FILTER (WHERE r.company_id IS NOT NULL AND trim(r.company_id) <> '') AS null_sp_but_rides_has_company,
  count(*) FILTER (WHERE r.company_id IS NULL OR trim(r.company_id) = '') AS null_sp_and_rides_company_null
FROM ride_financials rf
LEFT JOIN rides r ON r.id = rf.ride_id
WHERE rf.service_provider_company_id IS NULL;

\echo ''
\echo '=== 4) Stichprobe: letzte 10 mit „—“ laut API-COALESCE ==='
SELECT
  rf.ride_id,
  rf.calculated_at,
  rf.service_provider_company_id,
  r.company_id,
  r.driver_id,
  fd.company_id AS driver_company_id
FROM ride_financials rf
LEFT JOIN rides r ON r.id = rf.ride_id
LEFT JOIN fleet_drivers fd ON fd.id = r.driver_id
WHERE COALESCE(rf.service_provider_company_id, rf.partner_company_id, r.company_id) IS NULL
ORDER BY rf.calculated_at DESC
LIMIT 10;
