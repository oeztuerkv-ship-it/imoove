CREATE TABLE IF NOT EXISTS partner_registration_documents (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES partner_registration_requests (id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by_actor_type TEXT NOT NULL DEFAULT 'partner',
  uploaded_by_actor_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_registration_documents_request_created_idx
  ON partner_registration_documents (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_registration_timeline (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES partner_registration_requests (id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_label TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_registration_timeline_request_created_idx
  ON partner_registration_timeline (request_id, created_at DESC);
