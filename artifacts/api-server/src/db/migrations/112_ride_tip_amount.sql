-- Trinkgeld: separat vom Fahrpreis, 100 % an Fahrer (keine ONRODA-Provision).
ALTER TABLE rides ADD COLUMN IF NOT EXISTS tip_amount DOUBLE PRECISION NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS tip_paid_at TIMESTAMPTZ NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS stripe_tip_payment_intent_id TEXT NULL;

ALTER TABLE ride_financials ADD COLUMN IF NOT EXISTS tip_amount DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN rides.tip_amount IS 'Vom Kunden gegebenes Trinkgeld in EUR (nach Fahrtende).';
COMMENT ON COLUMN rides.tip_paid_at IS 'Zeitpunkt der Trinkgeld-Buchung (Stripe oder Bar-Hinweis).';
COMMENT ON COLUMN ride_financials.tip_amount IS 'Trinkgeld-Snapshot für Abrechnung (ohne Provision).';
