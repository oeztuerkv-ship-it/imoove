-- Admin-Sperrgrund, interne Notiz, optionale Stammdaten (Baujahr, Sitzplätze) für Plattform-Fahrzeugverwaltung
ALTER TABLE fleet_vehicles
  ADD COLUMN IF NOT EXISTS admin_internal_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS block_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model_year INTEGER,
  ADD COLUMN IF NOT EXISTS passenger_seats INTEGER;
