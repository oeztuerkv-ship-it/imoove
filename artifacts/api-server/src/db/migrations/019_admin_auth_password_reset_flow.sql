ALTER TABLE admin_auth_users
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

ALTER TABLE admin_auth_users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_users_email_lower
  ON admin_auth_users (lower(email))
  WHERE email <> '';

CREATE TABLE IF NOT EXISTS admin_auth_password_resets (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_auth_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_password_resets_token_hash_uq
  ON admin_auth_password_resets (token_hash);

CREATE INDEX IF NOT EXISTS admin_auth_password_resets_user_created_idx
  ON admin_auth_password_resets (admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_auth_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_auth_audit_log_created_idx
  ON admin_auth_audit_log (created_at DESC);
