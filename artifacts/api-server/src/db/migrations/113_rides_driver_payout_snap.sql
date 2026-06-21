-- Fahrer-Einnahmen-Snapshot auf rides (bei Fahrtende, neben Stripe-Capture).
ALTER TABLE rides ADD COLUMN IF NOT EXISTS provision_amount DOUBLE PRECISION NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payout_amount DOUBLE PRECISION NULL;

COMMENT ON COLUMN rides.provision_amount IS 'ONRODA-Provision in EUR (Snapshot bei Fahrtende, z. B. 8 % von final_fare).';
COMMENT ON COLUMN rides.payout_amount IS 'Fahrer-Anteil am Fahrtpreis in EUR (final_fare − provision_amount, ohne Trinkgeld).';

-- Rückwirkend: abgeschlossene Fahrten mit Endpreis, noch ohne Snapshot.
-- ROUND(..., n) erfordert numeric in PostgreSQL (nicht double precision).
UPDATE rides
SET
  provision_amount = ROUND((final_fare * 0.08)::numeric, 2)::double precision,
  payout_amount = ROUND(
    (final_fare - ROUND((final_fare * 0.08)::numeric, 2))::numeric,
    2
  )::double precision
WHERE status = 'completed'
  AND final_fare IS NOT NULL
  AND final_fare > 0
  AND (provision_amount IS NULL OR payout_amount IS NULL);
