CREATE TABLE IF NOT EXISTS admin_auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_auth_users_role_chk CHECK (role IN ('admin', 'service'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_auth_users_username_lower ON admin_auth_users (lower(username));
