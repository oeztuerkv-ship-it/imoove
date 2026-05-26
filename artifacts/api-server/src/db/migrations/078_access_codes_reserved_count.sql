-- 078: access_codes reserved_count für Fahrt-Reservierung
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS reserved_count integer NOT NULL DEFAULT 0;
