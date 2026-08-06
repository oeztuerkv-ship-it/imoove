-- 3 Klingeln in 60 s: je Phase 20 s (trio_a → pool_1 → pool_2), dann open ohne Extra-Push.

UPDATE app_operational_config
SET
  payload = jsonb_set(
    COALESCE(payload, '{}'::jsonb),
    '{dispatch,premiumTierTimeoutSeconds}',
    '20'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'default';
