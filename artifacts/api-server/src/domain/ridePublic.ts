import type { RideRequest } from "./rideRequest";

/** Partner-/Audit-Felder, die nicht in den gemeinsamen Fahrten-Poll (`GET /rides`) gehören. */
export function stripPartnerOnlyRideFields(r: RideRequest): RideRequest {
  const {
    accessCodeNormalizedSnapshot: _snap,
    accessCodeTripOutcome: _to,
    accessCodeDefinitionState: _ds,
    ...rest
  } = r;
  return rest;
}
