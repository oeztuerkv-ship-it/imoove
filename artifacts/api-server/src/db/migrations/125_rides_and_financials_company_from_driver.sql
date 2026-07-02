-- Altbestand: Mandant aus zugewiesenem Fleet-Fahrer nachziehen (Auszahlungen / Partner-Scope).
UPDATE rides r
SET company_id = fd.company_id
FROM fleet_drivers fd
WHERE r.driver_id = fd.id
  AND (r.company_id IS NULL OR trim(r.company_id) = '');

UPDATE ride_financials rf
SET
  service_provider_company_id = coalesce(r.company_id, fd.company_id),
  updated_at = NOW()
FROM rides r
LEFT JOIN fleet_drivers fd ON fd.id = r.driver_id
WHERE rf.ride_id = r.id
  AND rf.service_provider_company_id IS NULL
  AND coalesce(r.company_id, fd.company_id) IS NOT NULL;
