-- Leere company_codes nachziehen (Onboarding setzt sie oft nicht).
-- Gleiche Heuristik wie Migration 080: aus id ohne co-, Kollisionen mit -2/-3 …

UPDATE admin_companies
SET company_code = upper(
  left(
    regexp_replace(
      regexp_replace(trim(id), '^co-', '', 'i'),
      '[^a-zA-Z0-9]',
      '',
      'g'
    ),
    16
  )
)
WHERE trim(coalesce(company_code, '')) = ''
  AND trim(id) <> '';

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
