-- Kundenbewertungen: Durchschnitt auf Fahrer, Einmalbewertung pro Fahrt.
ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS rating_sum INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS passenger_rating SMALLINT;

COMMENT ON COLUMN fleet_drivers.rating_sum IS 'Summe aller Kunden-Sternbewertungen (1–5).';
COMMENT ON COLUMN fleet_drivers.rating_count IS 'Anzahl abgegebener Kundenbewertungen.';
COMMENT ON COLUMN rides.passenger_rating IS 'Kunden-Sterne (1–5) nach Fahrtende; einmalig.';
