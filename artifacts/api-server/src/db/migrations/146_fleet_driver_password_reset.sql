-- Fleet-Fahrer: Passwort-vergessen (6-stelliger Code, gehasht, einmalig, ablaufend)
CREATE TABLE IF NOT EXISTS fleet_driver_password_resets (
  id TEXT PRIMARY KEY,
  fleet_driver_id TEXT NOT NULL REFERENCES fleet_drivers (id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_driver_password_resets_token_hash_uq
  ON fleet_driver_password_resets (token_hash);

CREATE INDEX IF NOT EXISTS fleet_driver_password_resets_driver_created_idx
  ON fleet_driver_password_resets (fleet_driver_id, created_at DESC);
