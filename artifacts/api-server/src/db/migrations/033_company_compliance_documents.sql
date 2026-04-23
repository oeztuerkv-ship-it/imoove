-- Firmen-Compliance: aktuelle Fassung pro Nachweis (Gewerbe, Versicherung) mit Prüf-Metadaten
-- + Ausgangspunkt für globalen `admin_companies.compliance_status` (ableitbar, wird bei Upload/Review persistiert).

CREATE TABLE IF NOT EXISTS company_compliance_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_panel_user_id TEXT REFERENCES panel_users (id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '',
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT company_compliance_documents_type_chk
    CHECK (document_type IN ('gewerbe', 'insurance')),
  CONSTRAINT company_compliance_documents_review_chk
    CHECK (review_status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS company_compliance_documents_company_current_idx
  ON company_compliance_documents (company_id, document_type)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS company_compliance_documents_one_current_per_type
  ON company_compliance_documents (company_id, document_type)
  WHERE is_current = TRUE;

-- Bestehende Dateipfade aus admin_companies → erste Zeile pro Typ (eine inhaltliche Fassung; Upload-Zeit unbekannt → NOW)
INSERT INTO company_compliance_documents (id, company_id, document_type, storage_key, uploaded_by_panel_user_id, uploaded_at, review_status, review_note, is_current)
SELECT
  gen_random_uuid()::TEXT,
  c.id,
  'gewerbe',
  c.compliance_gewerbe_storage_key,
  NULL,
  NOW(),
  CASE
    WHEN
      c.compliance_gewerbe_storage_key IS NOT NULL
      AND c.compliance_insurance_storage_key IS NOT NULL
      AND c.compliance_status = 'compliant'
    THEN
      'approved'
    WHEN c.compliance_gewerbe_storage_key IS NOT NULL
    THEN
      'pending'
    ELSE
      'pending'
  END,
  '',
  TRUE
FROM admin_companies c
WHERE
  c.compliance_gewerbe_storage_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM company_compliance_documents d
    WHERE
      d.company_id = c.id
      AND d.document_type = 'gewerbe'
      AND d.is_current = TRUE
  );

INSERT INTO company_compliance_documents (id, company_id, document_type, storage_key, uploaded_by_panel_user_id, uploaded_at, review_status, review_note, is_current)
SELECT
  gen_random_uuid()::TEXT,
  c.id,
  'insurance',
  c.compliance_insurance_storage_key,
  NULL,
  NOW(),
  CASE
    WHEN
      c.compliance_gewerbe_storage_key IS NOT NULL
      AND c.compliance_insurance_storage_key IS NOT NULL
      AND c.compliance_status = 'compliant'
    THEN
      'approved'
    WHEN c.compliance_insurance_storage_key IS NOT NULL
    THEN
      'pending'
    ELSE
      'pending'
  END,
  '',
  TRUE
FROM admin_companies c
WHERE
  c.compliance_insurance_storage_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM company_compliance_documents d
    WHERE
      d.company_id = c.id
      AND d.document_type = 'insurance'
      AND d.is_current = TRUE
  );

-- `compliance_status` anhand vorhandener Nachweise + Review-Zustand angleichen
UPDATE admin_companies c
SET compliance_status = sub.new_status
FROM (
  SELECT
    ac.id,
    CASE
      WHEN
        ac.compliance_gewerbe_storage_key IS NULL
        OR ac.compliance_insurance_storage_key IS NULL
      THEN
        'pending'
      WHEN
        COALESCE(g.review_status, 'pending') = 'rejected'
        OR COALESCE(i.review_status, 'pending') = 'rejected'
      THEN
        'non_compliant'
      WHEN
        COALESCE(g.review_status, 'pending') = 'pending'
        OR COALESCE(i.review_status, 'pending') = 'pending'
      THEN
        'in_review'
      WHEN
        g.review_status = 'approved'
        AND i.review_status = 'approved'
      THEN
        'compliant'
      ELSE
        'in_review'
    END AS new_status
  FROM
    admin_companies ac
    LEFT JOIN company_compliance_documents g ON g.company_id = ac.id
    AND g.document_type = 'gewerbe'
    AND g.is_current = TRUE
    LEFT JOIN company_compliance_documents i ON i.company_id = ac.id
    AND i.document_type = 'insurance'
    AND i.is_current = TRUE
) sub
WHERE
  c.id = sub.id
  AND c.compliance_status IS DISTINCT FROM sub.new_status;
