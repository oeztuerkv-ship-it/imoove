-- Partner-Panel: Passwort-vergessen (Token gehasht, einmalig, ablaufend)
CREATE TABLE IF NOT EXISTS panel_password_resets (
  id TEXT PRIMARY KEY,
  panel_user_id TEXT NOT NULL REFERENCES panel_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS panel_password_resets_token_hash_uq
  ON panel_password_resets (token_hash);

CREATE INDEX IF NOT EXISTS panel_password_resets_user_created_idx
  ON panel_password_resets (panel_user_id, created_at DESC);
