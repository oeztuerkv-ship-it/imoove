-- Seed: 3 Bar-Fahrten in [period_start, period_end] für Taxi-Netting-Negativsaldo.
-- Aufruf:
--   psql "$DATABASE_URL" -v company_id=... -v period_start=YYYY-MM-DD \
--     -v period_end=YYYY-MM-DD -v seed_tag=netting-qa-YYYYMMDD \
--     -f scripts/runbooks/sql/seed-taxi-cash-negativsaldo-week.sql
--
-- Pro Fahrt: Brutto 40 €, Provision 8 €, operator_payout = −8 € (Bar).
-- Summe payout ≈ −24 € → Wochenlauf soll Provisionsrechnung erzeugen.
-- billing_mode: CHECK erlaubt nur direct|invoice|voucher|insurance|manual
-- (wie deriveBillingMode für passenger_direct → "direct").

\set ON_ERROR_STOP on

-- Guard über psql-Kontrollfluss (kein SQL 1/0 — Postgres faltet Literale vorzeitig).
SELECT EXISTS (
  SELECT 1 FROM admin_companies c
  WHERE c.id = :'company_id'
    AND lower(trim(c.company_kind)) = 'taxi'
    AND c.is_active IS TRUE
) AS company_ok
\gset

\if :company_ok
\echo 'Guard OK: gültiges aktives Taxi-Unternehmen.'
\else
\echo 'ERROR: company_id ist kein aktives Taxi-Unternehmen.'
\quit 1
\endif

DELETE FROM ride_financials
WHERE ride_id LIKE 'REQ-QA-NET-' || :'seed_tag' || '-%';

DELETE FROM rides
WHERE id LIKE 'REQ-QA-NET-' || :'seed_tag' || '-%';

INSERT INTO rides (
  id, company_id, created_at, completed_at, status,
  customer_name, from_label, from_full, to_label, to_full,
  distance_km, duration_minutes, estimated_fare, final_fare,
  payment_method, vehicle, ride_kind, payer_kind, authorization_source,
  payment_status, rejected_by
)
SELECT
  'REQ-QA-NET-' || :'seed_tag' || '-' || g.n,
  :'company_id',
  ((CAST(:'period_start' AS date) + 2) + time '12:00' + ((g.n - 1) * interval '1 hour'))
    AT TIME ZONE 'Europe/Berlin',
  ((CAST(:'period_start' AS date) + 2) + time '12:00' + ((g.n - 1) * interval '1 hour'))
    AT TIME ZONE 'Europe/Berlin',
  'completed',
  'QA Netting Cash',
  'QA Start',
  'QA Start Stuttgart',
  'QA Ziel',
  'QA Ziel Stuttgart',
  5.0,
  12,
  40.0,
  40.0,
  'cash',
  'standard',
  'standard',
  'passenger',
  'passenger_direct',
  'paid',
  '[]'::jsonb
FROM generate_series(1, 3) AS g(n);

INSERT INTO ride_financials (
  id, ride_id, payer_type, billing_mode,
  service_provider_company_id, partner_company_id,
  gross_amount, net_amount, vat_rate, vat_amount,
  commission_type, commission_value, commission_amount, operator_payout_amount,
  tip_amount, stripe_fee_amount,
  payout_line_status, billing_status, settlement_status,
  calculation_version, calculation_metadata_json
)
SELECT
  'rf-qa-net-' || :'seed_tag' || '-' || g.n,
  'REQ-QA-NET-' || :'seed_tag' || '-' || g.n,
  'passenger',
  'direct',
  :'company_id',
  NULL,
  40.0,
  40.0,
  0,
  0,
  'percentage',
  0.20,
  8.0,
  -8.0,
  0,
  0,
  'offen',
  'unbilled',
  'open',
  'v1-qa-seed',
  jsonb_build_object(
    'cashRide', true,
    'payoutModel', 'cash_commission_debt',
    'seedTag', :'seed_tag',
    'qa', true
  )
FROM generate_series(1, 3) AS g(n);

SELECT
  r.company_id,
  count(*) AS ride_count,
  round(sum(rf.operator_payout_amount)::numeric, 2) AS payout_sum,
  round(sum(rf.commission_amount)::numeric, 2) AS commission_sum,
  min(r.completed_at) AS completed_min,
  max(r.completed_at) AS completed_max,
  :'period_start' AS period_start,
  :'period_end' AS period_end
FROM rides r
JOIN ride_financials rf ON rf.ride_id = r.id
WHERE r.id LIKE 'REQ-QA-NET-' || :'seed_tag' || '-%'
GROUP BY r.company_id;
