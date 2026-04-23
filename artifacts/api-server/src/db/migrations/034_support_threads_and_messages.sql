-- Partner↔Plattform Anfragen (Thread + Nachrichten). Siehe docs/onroda-support-requests-architecture.md

CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  created_by_panel_user_id TEXT NOT NULL REFERENCES panel_users (id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_threads_category_chk
    CHECK (category IN ('stammdaten', 'documents', 'billing', 'technical', 'other')),
  CONSTRAINT support_threads_status_chk
    CHECK (status IN ('open', 'in_progress', 'answered', 'closed'))
);

CREATE INDEX IF NOT EXISTS support_threads_company_last_msg_idx
  ON support_threads (company_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS support_threads_status_last_msg_idx
  ON support_threads (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS support_threads_category_idx
  ON support_threads (category);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES support_threads (id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  sender_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_messages_sender_type_chk
    CHECK (sender_type IN ('partner', 'admin'))
);

CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON support_messages (thread_id, created_at ASC);
