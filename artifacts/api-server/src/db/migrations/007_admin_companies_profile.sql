-- Partner-Panel: Firmenstammdaten (Anschrift, Ansprechpartner, USt-ID).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/007_admin_companies_profile.sql

ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS address_line1 TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS address_line2 TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_companies ADD COLUMN IF NOT EXISTS vat_id TEXT NOT NULL DEFAULT '';
