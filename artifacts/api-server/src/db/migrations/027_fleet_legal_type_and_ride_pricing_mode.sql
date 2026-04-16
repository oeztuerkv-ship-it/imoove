ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS vehicle_legal_type TEXT NOT NULL DEFAULT 'taxi',
  ADD COLUMN IF NOT EXISTS vehicle_class TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fleet_drivers_vehicle_legal_type_chk'
  ) THEN
    ALTER TABLE fleet_drivers
      ADD CONSTRAINT fleet_drivers_vehicle_legal_type_chk
      CHECK (vehicle_legal_type IN ('taxi', 'rental_car'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fleet_drivers_vehicle_class_chk'
  ) THEN
    ALTER TABLE fleet_drivers
      ADD CONSTRAINT fleet_drivers_vehicle_class_chk
      CHECK (vehicle_class IN ('standard', 'xl', 'wheelchair'));
  END IF;
END $$;

ALTER TABLE fleet_vehicles
  ADD COLUMN IF NOT EXISTS vehicle_legal_type TEXT NOT NULL DEFAULT 'taxi',
  ADD COLUMN IF NOT EXISTS vehicle_class TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fleet_vehicles_legal_type_chk'
  ) THEN
    ALTER TABLE fleet_vehicles
      ADD CONSTRAINT fleet_vehicles_legal_type_chk
      CHECK (vehicle_legal_type IN ('taxi', 'rental_car'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fleet_vehicles_class_chk'
  ) THEN
    ALTER TABLE fleet_vehicles
      ADD CONSTRAINT fleet_vehicles_class_chk
      CHECK (vehicle_class IN ('standard', 'xl', 'wheelchair'));
  END IF;
END $$;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT;
