-- Leere company_codes nachziehen (Onboarding setzt sie oft nicht).
-- Heuristik wie Migration 080: aus id ohne co-, Kollisionen mit -2/-3 …
--
-- Idempotent / sicherer Re-Run nach Teil-Apply:
--   1) UPDATE nur WHERE company_code leer → bereits befüllte Zeilen bleiben unberührt.
--   2) Dedup nur WHERE rn > 1 → bei eindeutigen Codes 0 Zeilen.
-- admin_companies hat kein created_at — Sortierung nur über id.

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
    row_number() OVER (PARTITION BY upper(company_code) ORDER BY id) AS rn
  FROM admin_companies
  WHERE trim(company_code) <> ''
)
UPDATE admin_companies c
SET company_code = left(r.company_code, 12) || '-' || r.rn::text
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;
