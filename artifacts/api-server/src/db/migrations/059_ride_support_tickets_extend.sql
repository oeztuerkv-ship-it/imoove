-- Erweiterung ride_support_tickets (047): Mandantenbezug, Priorität, Quelle, Actor-Provenance
ALTER TABLE ride_support_tickets ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL;

ALTER TABLE ride_support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE ride_support_tickets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'mobile';

ALTER TABLE ride_support_tickets ADD COLUMN IF NOT EXISTS created_by_actor_kind TEXT NOT NULL DEFAULT 'customer';

ALTER TABLE ride_support_tickets ADD COLUMN IF NOT EXISTS created_by_actor_id TEXT;

CREATE INDEX IF NOT EXISTS ride_support_tickets_company_created_idx
  ON ride_support_tickets (company_id, created_at DESC);
