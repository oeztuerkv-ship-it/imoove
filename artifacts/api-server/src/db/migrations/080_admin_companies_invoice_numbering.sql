-- Mandanten-Codes + Rechnungsnummern-Prefixe + Sequenz-Tabelle (ONR-HOT-2026-04-001).

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS company_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_sequence_next INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN admin_companies.company_code IS 'Öffentlicher Mandanten-Code (eindeutig), z. B. STADTMITTE — nicht company_id.';
COMMENT ON COLUMN admin_companies.invoice_prefix IS 'Rechnungs-Prefix ONR-{PREFIX}-… — Default aus company_kind (HOT, MED, …), mehrere Mandanten können dasselbe Prefix teilen.';
COMMENT ON COLUMN admin_companies.invoice_sequence_next IS 'Legacy/Reserve — Laufnummer liegt in invoice_number_sequences.';

CREATE UNIQUE INDEX IF NOT EXISTS admin_companies_company_code_unique_idx
  ON admin_companies (upper(company_code))
  WHERE trim(company_code) <> '';

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  invoice_prefix TEXT NOT NULL,
  period_ym TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (invoice_prefix, period_ym),
  CONSTRAINT invoice_number_sequences_prefix_chk
    CHECK (invoice_prefix ~ '^[A-Z0-9]{2,8}$'),
  CONSTRAINT invoice_number_sequences_period_chk
    CHECK (period_ym ~ '^\d{4}-\d{2}$'),
  CONSTRAINT invoice_number_sequences_next_chk
    CHECK (next_value >= 1)
);

-- Defaults aus company_kind
UPDATE admin_companies
SET invoice_prefix = CASE lower(trim(company_kind))
  WHEN 'hotel' THEN 'HOT'
  WHEN 'corporate' THEN 'COR'
  WHEN 'medical' THEN 'MED'
  WHEN 'insurer' THEN 'MED'
  WHEN 'taxi' THEN 'TAX'
  WHEN 'voucher_client' THEN 'VCH'
  ELSE 'GEN'
END
WHERE trim(coalesce(invoice_prefix, '')) = '';

-- company_code aus id (co-demo-1 → DEMO1) wenn leer
UPDATE admin_companies
SET company_code = upper(
  regexp_replace(
    regexp_replace(trim(id), '^co-', '', 'i'),
    '[^a-zA-Z0-9]',
    '',
    'g'
  )
)
WHERE trim(coalesce(company_code, '')) = ''
  AND trim(id) <> '';

-- Kollisionen: Suffix -2, -3 …
WITH ranked AS (
  SELECT
    id,
    company_code,
    row_number() OVER (PARTITION BY upper(company_code) ORDER BY created_at NULLS LAST, id) AS rn
  FROM admin_companies
  WHERE trim(company_code) <> ''
)
UPDATE admin_companies c
SET company_code = left(r.company_code, 12) || '-' || r.rn::text
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- Legacy ONR-YYYY-MM-N → ONR-GEN-YYYY-MM-NNN
UPDATE invoices i
SET invoice_number = 'ONR-GEN-' || m[1] || '-' || m[2] || '-' || lpad(m[3], 3, '0')
FROM (
  SELECT id, regexp_match(invoice_number, '^ONR-(\d{4})-(\d{2})-(\d+)$') AS m
  FROM invoices
) src
WHERE i.id = src.id AND src.m IS NOT NULL;

UPDATE invoices i
SET invoice_number = 'ONR-HOT-2026-04-001'
WHERE i.id = 'inv-apr-2026-demo'
  AND exists (SELECT 1 FROM admin_companies c WHERE c.id = i.company_id AND lower(c.company_kind) = 'hotel');

-- Sequenz aus bestehenden Rechnungen (höchste SEQ je Prefix+Monat + 1)
INSERT INTO invoice_number_sequences (invoice_prefix, period_ym, next_value)
SELECT
  upper((regexp_match(invoice_number, '^ONR-([A-Z0-9]{2,8})-(\d{4})-(\d{2})-(\d{3})$'))[1]) AS invoice_prefix,
  (regexp_match(invoice_number, '^ONR-([A-Z0-9]{2,8})-(\d{4})-(\d{2})-(\d{3})$'))[2]
    || '-'
    || (regexp_match(invoice_number, '^ONR-([A-Z0-9]{2,8})-(\d{4})-(\d{2})-(\d{3})$'))[3] AS period_ym,
  coalesce(max((regexp_match(invoice_number, '^ONR-([A-Z0-9]{2,8})-(\d{4})-(\d{2})-(\d{3})$'))[4]::int), 0) + 1 AS next_value
FROM invoices
WHERE invoice_number ~ '^ONR-[A-Z0-9]{2,8}-\d{4}-\d{2}-\d{3}$'
GROUP BY 1, 2
ON CONFLICT (invoice_prefix, period_ym) DO UPDATE
SET next_value = greatest(invoice_number_sequences.next_value, excluded.next_value);
