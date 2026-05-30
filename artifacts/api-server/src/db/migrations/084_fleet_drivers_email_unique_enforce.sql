-- Eine E-Mail = ein Fahrer-Datensatz = ein Mandant (keine Doppel-Registrierung).
-- Bereits in 022 angelegt; 084 stellt sicher, dass der Index auf allen Instanzen existiert.

CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_email_lower_uidx
  ON fleet_drivers (lower(trim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_company_email_lower_uidx
  ON fleet_drivers (company_id, lower(trim(email)));

COMMENT ON INDEX fleet_drivers_email_lower_uidx IS
  'Plattformweit: eine E-Mail nur einmal in fleet_drivers (ein Mandant).';
