import {
  evaluateDriverFinalFareTariffCorridor,
  FINAL_FARE_TARIFF_CORRIDOR_RATIO,
  overlayMergedTariffAudit,
} from "../lib/driverFinalFareTariffCorridor";
import { estimateTaxiFromMergedTariff } from "../lib/operationalTariffEngine";

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

const est = estimateTaxiFromMergedTariff(merged, {
  distanceKm: 4,
  tripMinutes: 10,
  waitingMinutes: 2,
  vehicle: "standard",
  at: new Date("2026-06-17T14:00:00+02:00"),
});
const expected = est.finalRounded;
assert(expected > 4.3, `expected fare should exceed base, got ${expected}`);

const okMid = evaluateDriverFinalFareTariffCorridor({
  driverEnteredFareEur: expected,
  actualDistanceKm: 4,
  actualDurationMinutes: 10,
  waitingMinutesBilled: 2,
  vehicle: "standard",
  at: new Date("2026-06-17T14:00:00+02:00"),
  applyHolidaySurcharge: false,
  applyAirportFlat: false,
  merged,
});
assert(okMid.ok === true, "exact match should pass");

const tooLow = evaluateDriverFinalFareTariffCorridor({
  driverEnteredFareEur: 3.0,
  actualDistanceKm: 4,
  actualDurationMinutes: 10,
  waitingMinutesBilled: 2,
  vehicle: "standard",
  at: new Date("2026-06-17T14:00:00+02:00"),
  applyHolidaySurcharge: false,
  applyAirportFlat: false,
  merged,
});
assert(tooLow.ok === false && tooLow.error === "final_fare_below_base", "below base must fail");

const outside = expected * (1 + FINAL_FARE_TARIFF_CORRIDOR_RATIO + 0.05);
const tooHigh = evaluateDriverFinalFareTariffCorridor({
  driverEnteredFareEur: Math.round(outside * 100) / 100,
  actualDistanceKm: 4,
  actualDurationMinutes: 10,
  waitingMinutesBilled: 2,
  vehicle: "standard",
  at: new Date("2026-06-17T14:00:00+02:00"),
  applyHolidaySurcharge: false,
  applyAirportFlat: false,
  merged,
});
assert(
  tooHigh.ok === false && tooHigh.error === "final_fare_outside_tariff_corridor",
  "outside corridor must fail hard",
);

const overlaid = overlayMergedTariffAudit(merged, { baseFare: 5.0, perKm: 3.0 });
assert(n(overlaid.baseFare) === 5.0 && n(overlaid.perKm) === 3.0, "audit overlay");

function n(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

console.log("driverFinalFareTariffCorridorSelftest: OK");
