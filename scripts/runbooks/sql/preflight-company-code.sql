-- QA-Preflight: leere company_codes + Lookup der Testfirma
-- Aufruf: psql "$DATABASE_URL" -v company_id="$COMPANY_ID" -f …/preflight-company-code.sql

SELECT
  count(*) FILTER (WHERE trim(coalesce(company_code, '')) = '') AS missing_company_code,
  count(*) AS total_companies
FROM admin_companies;

SELECT id, name, company_code
FROM admin_companies
WHERE id = :'company_id';
