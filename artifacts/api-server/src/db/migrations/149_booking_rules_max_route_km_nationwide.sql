-- Ziele bundesweit: maxRouteKm 200 blockierte z. B. Freiburg/München mit generischem
-- „Plattform-Regeln nicht zulässig“ (route_too_long). Servicegebiet prüft nur Abholung.
-- Nur anheben, wenn aktuell ≤ 200 (Admin-Werte darüber bleiben).

UPDATE app_operational_config
SET
  payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{bookingRules,maxRouteKm}',
    '1200'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'default'
  AND COALESCE((payload #>> '{bookingRules,maxRouteKm}')::numeric, 200) <= 200;
