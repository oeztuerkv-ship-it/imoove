ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS accessibility_options_json JSONB NOT NULL DEFAULT '{}'::jsonb;

