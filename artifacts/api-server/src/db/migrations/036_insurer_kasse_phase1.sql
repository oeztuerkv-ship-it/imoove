-- Phase 1 Krankenkassen-Modus: Export-Batches + optionale feine Korrekturhistorie (read-mostly).
-- Keine Änderung an rides/ride_core.

CREATE TABLE IF NOT EXISTS billing_export_batches (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_label TEXT NOT NULL DEFAULT '',
  period_from TIMESTAMPTZ NOT NULL,
  period_to TIMESTAMPTZ NOT NULL,
  company_id_filter TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  row_count INTEGER NOT NULL DEFAULT 0,
  file_rel_path TEXT NOT NULL DEFAULT '',
  included_ride_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  schema_version TEXT NOT NULL DEFAULT 'insurer_export_v1'
);

CREATE INDEX IF NOT EXISTS billing_export_batches_created_at_idx
  ON billing_export_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS ride_billing_corrections (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  reason_code TEXT NOT NULL DEFAULT '',
  reason_note TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_billing_corrections_ride_created_idx
  ON ride_billing_corrections (ride_id, created_at DESC);
