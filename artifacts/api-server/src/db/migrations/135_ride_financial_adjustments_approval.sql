-- P5.1 Vier-Augen: Freigabe-Status für manuelle Korrekturen ab Schwellenbetrag.

ALTER TABLE ride_financial_adjustments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS requested_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE ride_financial_adjustments DROP CONSTRAINT IF EXISTS ride_financial_adjustments_approval_status_chk;
ALTER TABLE ride_financial_adjustments
  ADD CONSTRAINT ride_financial_adjustments_approval_status_chk
  CHECK (approval_status IN ('approved', 'pending_approval', 'rejected'));

-- Bestehende Zeilen: freigegeben; Wirksamkeitszeit = Buchungszeit.
UPDATE ride_financial_adjustments
SET
  approval_status = 'approved',
  approved_at = coalesce(approved_at, created_at),
  requested_by = coalesce(requested_by, actor_id)
WHERE approval_status IS NULL
   OR trim(approval_status) = ''
   OR approval_status = 'approved';

CREATE INDEX IF NOT EXISTS ride_financial_adjustments_approval_status_idx
  ON ride_financial_adjustments (approval_status, created_at DESC);

COMMENT ON COLUMN ride_financial_adjustments.approval_status IS
  'approved | pending_approval | rejected; nur approved zählt im Partner-Saldo.';
COMMENT ON COLUMN ride_financial_adjustments.approved_at IS
  'Wirksamkeit für Periodenfilter (coalesce mit created_at); bei Sofort-Freigabe = created_at.';
