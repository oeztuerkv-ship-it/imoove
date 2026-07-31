-- Phase B: Settlement-Richtung + Verknüpfung Provisionsrechnung.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'platform_pays_partner';

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_direction_chk;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_direction_chk
  CHECK (direction IN ('platform_pays_partner', 'partner_pays_platform'));

-- Bestehende Zeilen: Vorzeichen von payout_amount.
UPDATE settlements
SET direction = CASE
  WHEN coalesce(payout_amount, 0) < -0.004 THEN 'partner_pays_platform'
  ELSE 'platform_pays_partner'
END
WHERE direction IS NULL
   OR trim(direction) = ''
   OR direction NOT IN ('platform_pays_partner', 'partner_pays_platform');

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS commission_invoice_id TEXT REFERENCES invoices (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS settlements_direction_idx
  ON settlements (direction, status, period_end DESC);

CREATE INDEX IF NOT EXISTS settlements_commission_invoice_idx
  ON settlements (commission_invoice_id)
  WHERE commission_invoice_id IS NOT NULL;

COMMENT ON COLUMN settlements.direction IS
  'platform_pays_partner wenn payout_amount > 0; partner_pays_platform wenn Negativsaldo (Unternehmen schuldet).';
COMMENT ON COLUMN settlements.commission_invoice_id IS
  'Bei partner_pays_platform: verknüpfte Provisionsrechnung (invoices).';
