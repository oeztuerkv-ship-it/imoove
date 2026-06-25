-- Partner-Panel: Festpreis-Gutschein-Käufe (Stripe Checkout → Access-Code + PDF).

CREATE TABLE IF NOT EXISTS fixed_price_voucher_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  access_code_id TEXT REFERENCES access_codes (id) ON DELETE SET NULL,
  code_plain TEXT,
  label TEXT NOT NULL DEFAULT '',
  from_full TEXT NOT NULL DEFAULT '',
  to_full TEXT NOT NULL DEFAULT '',
  from_lat DOUBLE PRECISION,
  from_lon DOUBLE PRECISION,
  to_lat DOUBLE PRECISION,
  to_lon DOUBLE PRECISION,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  vehicle TEXT NOT NULL DEFAULT 'standard',
  price_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_price_eur DOUBLE PRECISION,
  vehicle_surcharge_eur DOUBLE PRECISION,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  CONSTRAINT fixed_price_voucher_orders_status_chk CHECK (
    status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS fixed_price_voucher_orders_company_created_idx
  ON fixed_price_voucher_orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fixed_price_voucher_orders_stripe_session_idx
  ON fixed_price_voucher_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON TABLE fixed_price_voucher_orders IS
  'Partner-Festpreis-Gutschein: Zahlung per Stripe Checkout, danach Access-Code + PDF-Download.';
