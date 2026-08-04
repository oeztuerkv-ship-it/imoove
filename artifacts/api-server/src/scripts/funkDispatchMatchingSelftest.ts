/**
 * Funk-Dispatch: Koordinaten-Normalisierung + Fahrzeug-Matching (XL darf Standard).
 * Run: pnpm --filter @workspace/api-server run test:funk-dispatch-matching
 */
import assert from "node:assert/strict";
import type { RideRequest } from "../domain/rideRequest";
import {
  isRideCompatibleWithCapability,
  rideRequiredVehicleClass,
  type DriverRideCapability,
} from "../db/fleetMatchingData";
import { finiteCoordOrNull, funkRideRequiresCoords } from "../lib/funkDispatchCoords";

function baseRide(over: Partial<RideRequest> = {}): RideRequest {
  return {
    id: "ride-funk-selftest",
    companyId: "co-test",
    createdAt: new Date().toISOString(),
    scheduledAt: null,
    status: "searching_driver",
    rejectedBy: [],
    driverId: null,
    dispatchMode: "funk",
    customerName: "Telefonkunde",
    from: "Test",
    fromFull: "Teststraße 1, 70771 Leinfelden",
    to: "Ziel",
    toFull: "Zielstraße 2, 70771 Leinfelden",
    fromLat: 48.69,
    fromLon: 9.14,
    toLat: 48.7,
    toLon: 9.15,
    distanceKm: 3,
    durationMinutes: 10,
    estimatedFare: 12,
    paymentMethod: "funk",
    vehicle: "standard",
    rideKind: "standard",
    payerKind: "passenger",
    authorizationSource: "partner",
    ...over,
  };
}

function cap(over: Partial<DriverRideCapability> = {}): DriverRideCapability {
  return {
    vehicleLegalType: "taxi",
    vehicleClass: "standard",
    vehicleType: "sedan",
    ...over,
  };
}

// --- Coords ---
assert.equal(finiteCoordOrNull(undefined), null);
assert.equal(finiteCoordOrNull(null), null);
assert.equal(finiteCoordOrNull(Number.NaN), null);
assert.equal(finiteCoordOrNull(Infinity), null);
assert.equal(finiteCoordOrNull(48.69), 48.69);
assert.equal(funkRideRequiresCoords({ fromLat: Number.NaN, fromLon: 9.1 }), false);
assert.equal(funkRideRequiresCoords({ fromLat: 48.69, fromLon: 9.14 }), true);

// Regression: NaN must not be treated as “present” (would skip geocode / empty candidates)
assert.equal(Number.isFinite(Number.NaN), false);
assert.equal(Number.NaN == null, false);

// --- Matching: Standard-Fahrt — XL und Rollstuhl dürfen annehmen ---
assert.equal(rideRequiredVehicleClass(baseRide({ vehicle: "standard" })), null);
assert.equal(isRideCompatibleWithCapability(baseRide({ vehicle: "standard" }), cap({ vehicleClass: "standard" })), true);
assert.equal(isRideCompatibleWithCapability(baseRide({ vehicle: "standard" }), cap({ vehicleClass: "xl" })), true);
assert.equal(
  isRideCompatibleWithCapability(baseRide({ vehicle: "standard" }), cap({ vehicleClass: "wheelchair", vehicleType: "wheelchair" })),
  true,
);

// XL-Anforderung: nur XL/Rollstuhl
assert.equal(rideRequiredVehicleClass(baseRide({ vehicle: "xl" })), "xl");
assert.equal(isRideCompatibleWithCapability(baseRide({ vehicle: "xl" }), cap({ vehicleClass: "standard" })), false);
assert.equal(isRideCompatibleWithCapability(baseRide({ vehicle: "xl" }), cap({ vehicleClass: "xl" })), true);
assert.equal(
  isRideCompatibleWithCapability(baseRide({ vehicle: "xl" }), cap({ vehicleClass: "wheelchair", vehicleType: "wheelchair" })),
  true,
);

console.log("OK funkDispatchMatchingSelftest (coords + XL/standard matching)");
