ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_trip_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS waiting_minutes_billed INTEGER NULL,
  ADD COLUMN IF NOT EXISTS waiting_charge_eur DOUBLE PRECISION NULL;

COMMENT ON COLUMN rides.driver_trip_started_at IS 'Fahrtbeginn (in_progress) — Ende der Wartezeitabrechnung';
COMMENT ON COLUMN rides.waiting_minutes_billed IS 'Abgerechnete Wartezeit in Minuten (bis Fahrtbeginn)';
COMMENT ON COLUMN rides.waiting_charge_eur IS 'Wartezeit-Zuschlag in EUR (Tarif z. B. 38 €/Std)';
