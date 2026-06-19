import assert from "node:assert";
import type { RideRequest } from "../domain/rideRequest";
import { signSessionJwt } from "../lib/sessionJwt";
import { wsJoinPrincipalMatchesRide } from "../lib/wsRideJoinAuth";

const baseRide = (): RideRequest =>
  ({
    id: "ride-test-1",
    status: "accepted",
    passengerId: "google-passenger-a",
    driverId: "fleet-driver-1",
    companyId: "co-demo-1",
    from: "A",
    to: "B",
    fromFull: "A",
    toFull: "B",
    estimatedFare: 12,
    createdAt: new Date(),
    paymentMethod: "Bar",
    vehicle: "standard",
  }) as RideRequest;

async function testRideAuthorizationMatrix(): Promise<void> {
  const ride = baseRide();

  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, { kind: "customer", passengerGoogleId: "google-passenger-a" }),
    true,
  );
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, { kind: "customer", passengerGoogleId: "google-passenger-b" }),
    false,
  );
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, {
      kind: "fleet",
      fleetDriverId: "fleet-driver-1",
      companyId: "co-demo-1",
    }),
    true,
  );
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, {
      kind: "fleet",
      fleetDriverId: "fleet-driver-2",
      companyId: "co-demo-1",
    }),
    false,
  );
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, { kind: "panel", companyId: "co-demo-1", panelUserId: "pu-1" }),
    true,
  );
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(ride, { kind: "panel", companyId: "co-other", panelUserId: "pu-1" }),
    false,
  );

  const unassigned = { ...ride, driverId: null };
  assert.strictEqual(
    wsJoinPrincipalMatchesRide(unassigned, {
      kind: "fleet",
      fleetDriverId: "fleet-driver-1",
      companyId: "co-demo-1",
    }),
    false,
  );
}

async function testExpiredSessionJwtRejected(): Promise<void> {
  process.env.AUTH_JWT_SECRET = "ws-join-selftest-secret-32chars-min";
  process.env.AUTH_JWT_ISSUER = "onroda-api-selftest";

  const expired = await signSessionJwt(
    {
      googleId: "google-passenger-a",
      email: "a@test.de",
      name: "A",
      photoUri: null,
    },
    "-1s",
  );

  const { verifySessionJwt } = await import("../lib/sessionJwt.js");
  await assert.rejects(() => verifySessionJwt(expired));
}

async function main(): Promise<void> {
  await testRideAuthorizationMatrix();
  await testExpiredSessionJwtRejected();
}

main()
  .then(() => {
    console.info("wsRideJoinAuthSelftest: OK");
  })
  .catch((err) => {
    console.error("wsRideJoinAuthSelftest: FAILED", err);
    process.exit(1);
  });
