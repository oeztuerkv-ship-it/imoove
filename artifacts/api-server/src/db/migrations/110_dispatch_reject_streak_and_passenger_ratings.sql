-- 20× Ablehnen → Dispatch-Priorität; Fahrer bewertet Kunde (1–5).

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS dispatch_reject_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_passenger_rating SMALLINT;

ALTER TABLE passenger_profiles
  ADD COLUMN IF NOT EXISTS rating_sum INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN fleet_drivers.dispatch_reject_streak IS 'Aufeinanderfolgende Markt-Ablehnungen; bei 20 → Priorität A→B→C.';
COMMENT ON COLUMN rides.driver_passenger_rating IS 'Fahrer-Sterne (1–5) für Kunde nach Fahrtende; einmalig.';
COMMENT ON COLUMN passenger_profiles.rating_sum IS 'Summe Fahrer-Bewertungen des Kunden (1–5).';
COMMENT ON COLUMN passenger_profiles.rating_count IS 'Anzahl Fahrer-Bewertungen des Kunden.';
