import { computeRideGpsTrackMetrics } from "../lib/rideGpsTrackMetrics";
import {
  evaluateDriverFinalFareTariffCorridor,
  FINAL_FARE_TARIFF_CORRIDOR_RATIO,
} from "../lib/driverFinalFareTariffCorridor";
import { estimateTaxiFromMergedTariff } from "../lib/operationalTariffEngine";
import {
  evaluateMidTripAbortTaximeterFare,
  isUsableMidTripGpsTrack,
  MID_TRIP_ABORT_CORRIDOR_RATIO,
  midTripAbortAbsoluteFareCapEur,
  resolveMidTripAbortGpsWindowEnd,
} from "../lib/rideMidTripAbortFare";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const merged = {
  active: true,
  baseFare: 4.3,
  perKm: 2.5,
  kmPricingModel: "single",
  pricePerMinute: 0.5,
  waitingPerHour: 30,
  rounding: "nearest_tenth",
  nightSurchargePercent: 0,
};

const at = new Date("2026-08-03T12:00:00+02:00");

/** Volle geplante Fahrt ~ wie Live-Beispiel (~52 €). */
const fullEst = estimateTaxiFromMergedTariff(merged, {
  distanceKm: 18,
  tripMinutes: 35,
  waitingMinutes: 0,
  vehicle: "standard",
  at,
});
assert(fullEst.finalRounded > 40, `full estimate should be high, got ${fullEst.finalRounded}`);

/** Kurzstrecke bis Abbruch. */
const shortKm = 0.4;
const shortMin = 2;
const shortEst = estimateTaxiFromMergedTariff(merged, {
  distanceKm: shortKm,
  tripMinutes: shortMin,
  waitingMinutes: 0,
  vehicle: "standard",
  at,
});
assert(
  shortEst.finalRounded < fullEst.finalRounded * 0.4,
  `short expected (${shortEst.finalRounded}) must be far below full (${fullEst.finalRounded})`,
);

const shortCorridorOk = evaluateDriverFinalFareTariffCorridor({
  driverEnteredFareEur: shortEst.finalRounded,
  actualDistanceKm: shortKm,
  actualDurationMinutes: shortMin,
  waitingMinutesBilled: 0,
  vehicle: "standard",
  at,
  applyHolidaySurcharge: false,
  applyAirportFlat: false,
  merged,
  corridorRatio: MID_TRIP_ABORT_CORRIDOR_RATIO,
});
assert(shortCorridorOk.ok === true, "short trip exact expected must pass mid-trip corridor");

const bookingLikeCorridor = evaluateDriverFinalFareTariffCorridor({
  driverEnteredFareEur: fullEst.finalRounded,
  actualDistanceKm: shortKm,
  actualDurationMinutes: shortMin,
  waitingMinutesBilled: 0,
  vehicle: "standard",
  at,
  applyHolidaySurcharge: false,
  applyAirportFlat: false,
  merged,
  corridorRatio: MID_TRIP_ABORT_CORRIDOR_RATIO,
});
assert(
  bookingLikeCorridor.ok === false && bookingLikeCorridor.error === "final_fare_outside_tariff_corridor",
  "full booking fare must fail against short GPS corridor",
);

const midTripShortPass = evaluateMidTripAbortTaximeterFare({
  enteredEur: shortEst.finalRounded,
  minFareEur: 4.3,
  bookingEstimatedFareEur: fullEst.finalRounded,
  gpsMetrics: { distanceKm: shortKm, durationMinutes: shortMin },
  plausibilityAck: false,
  corridor: shortCorridorOk,
});
assert(midTripShortPass.ok === true && midTripShortPass.mode === "gps_corridor", "short taximeter vs short GPS must pass");
assert(
  midTripShortPass.ok &&
    midTripShortPass.expectedFareEur != null &&
    Math.abs(midTripShortPass.expectedFareEur - shortEst.finalRounded) < 0.05,
  "expected must track short engine fare, not booking estimate",
);

const midTripFullFail = evaluateMidTripAbortTaximeterFare({
  enteredEur: fullEst.finalRounded,
  minFareEur: 4.3,
  bookingEstimatedFareEur: fullEst.finalRounded,
  gpsMetrics: { distanceKm: shortKm, durationMinutes: shortMin },
  plausibilityAck: false,
  corridor: bookingLikeCorridor,
});
assert(midTripFullFail.ok === false, "entering full booking fare on short GPS must fail");

/** Ohne GPS: niedriger realistischer Betrag OK trotz hoher Buchungsschätzung. */
const noGpsLow = evaluateMidTripAbortTaximeterFare({
  enteredEur: 8,
  minFareEur: 4.3,
  bookingEstimatedFareEur: fullEst.finalRounded,
  gpsMetrics: null,
  plausibilityAck: false,
  corridor: null,
});
assert(noGpsLow.ok === true && noGpsLow.mode === "no_gps_abs_cap", "no-GPS low fare must pass");

const absCap = midTripAbortAbsoluteFareCapEur(fullEst.finalRounded);
const noGpsCrazy = evaluateMidTripAbortTaximeterFare({
  enteredEur: absCap + 50,
  minFareEur: 4.3,
  bookingEstimatedFareEur: fullEst.finalRounded,
  gpsMetrics: null,
  plausibilityAck: false,
  corridor: null,
});
assert(
  noGpsCrazy.ok === false && noGpsCrazy.error === "final_fare_above_absolute_cap",
  "no-GPS must still block absurd absolute amounts",
);

assert(!isUsableMidTripGpsTrack(null), "null track not usable");
assert(!isUsableMidTripGpsTrack({ distanceKm: 0, durationMinutes: 0 }), "zero metrics not usable");
assert(isUsableMidTripGpsTrack({ distanceKm: 0.4, durationMinutes: 2 }), "short track usable");

const abortAt = new Date("2026-08-03T12:05:00+02:00");
const windowEnd = resolveMidTripAbortGpsWindowEnd(abortAt.toISOString(), new Date("2026-08-03T12:30:00+02:00"));
assert(windowEnd.getTime() === abortAt.getTime(), "GPS window end must use abort timestamp, not finalize-now");

const tripStart = new Date("2026-08-03T12:00:00+02:00");
const points = [
  { lat: 48.13, lon: 11.57, recordedAt: new Date("2026-08-03T12:01:00+02:00") },
  { lat: 48.131, lon: 11.572, recordedAt: new Date("2026-08-03T12:03:00+02:00") },
  { lat: 48.2, lon: 11.7, recordedAt: new Date("2026-08-03T12:20:00+02:00") }, // nach Abort — ignorieren
];
const clipped = computeRideGpsTrackMetrics(points, tripStart, abortAt);
assert(clipped != null, "clipped metrics required");
assert(clipped!.durationMinutes <= 6, `duration must end at abort, got ${clipped!.durationMinutes}`);
assert(clipped!.distanceKm < 5, `post-abort points must not inflate distance, got ${clipped!.distanceKm}`);

assert(MID_TRIP_ABORT_CORRIDOR_RATIO > FINAL_FARE_TARIFF_CORRIDOR_RATIO, "mid-trip corridor wider than completion");

console.log("midTripAbortFareSelftest: OK");
