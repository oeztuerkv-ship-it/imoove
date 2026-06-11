ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cash_confirmed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN rides.payment_status IS 'pending | paid | failed | refunded';
COMMENT ON COLUMN rides.stripe_payment_intent_id IS 'Stripe PaymentIntent bei Kartenzahlung';
COMMENT ON COLUMN rides.cash_confirmed_at IS 'Fahrer bestätigt Barzahlung erhalten';
