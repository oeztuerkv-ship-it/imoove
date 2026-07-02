-- Fahrer-Storno-Sperre: nach 5 Stornos nach Annahme innerhalb von 7 Tagen → 24h kein Dispatch.
CREATE TABLE IF NOT EXISTS fleet_driver_cancellation_suspension (
  fleet_driver_id TEXT NOT NULL PRIMARY KEY REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES admin_companies(id) ON DELETE CASCADE,
  suspended_until TIMESTAMPTZ NOT NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL DEFAULT 'too_many_post_accept_cancellations',
  lifted_at TIMESTAMPTZ,
  lifted_by_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fleet_driver_cancellation_suspension_until_idx
  ON fleet_driver_cancellation_suspension (suspended_until DESC);

COMMENT ON TABLE fleet_driver_cancellation_suspension IS
  'Temporäre Sperre für Fahrer nach zu vielen Stornos nach Fahrtannahme (Soft/Hard gleich).';
