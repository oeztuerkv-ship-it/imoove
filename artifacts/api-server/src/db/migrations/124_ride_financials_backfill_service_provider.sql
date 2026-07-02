-- Legacy: service_provider_company_id aus rides.company_id nachziehen (Anzeige Auszahlungen).
UPDATE ride_financials rf
SET
  service_provider_company_id = r.company_id,
  updated_at = NOW()
FROM rides r
WHERE rf.ride_id = r.id
  AND rf.service_provider_company_id IS NULL
  AND r.company_id IS NOT NULL;
