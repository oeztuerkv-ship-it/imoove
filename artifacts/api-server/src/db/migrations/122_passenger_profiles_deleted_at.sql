-- Konto-Löschung (DSGVO Art. 17 / Apple 5.1.1v): OAuth- und Session-Sperre

ALTER TABLE passenger_profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS passenger_profiles_deleted_at_idx
  ON passenger_profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN passenger_profiles.deleted_at IS 'Zeitpunkt der Konto-Anonymisierung; Login und API-Zugriff gesperrt.';
