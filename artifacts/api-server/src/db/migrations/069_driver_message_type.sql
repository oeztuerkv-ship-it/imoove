-- Migration 069: add message_type to driver_messages
ALTER TABLE driver_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'inbox'
  CHECK (message_type IN ('push_only', 'inbox'));
