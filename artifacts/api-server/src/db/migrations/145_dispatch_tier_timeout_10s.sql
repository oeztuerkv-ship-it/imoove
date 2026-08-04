-- Produkt: A→B Timeout Standard 10 s (vorher oft 60 s in app_operational_config).
-- Kein A market-online → Sofortfahrt springt ohnehin sofort auf B (Code).

UPDATE app_operational_config
SET
  payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{dispatch,premiumTierTimeoutSeconds}',
    '10'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'default';
