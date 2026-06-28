import { computeFixedPriceVehicleSurchargeEur } from "../lib/fixedPriceBooking";
import {
  applyPlatformVehicleSurcharges,
  estimateTaxiFromMergedTariff,
  readPlatformVehicleSurchargeEur,
  resolveMergedTariff,
} from "../lib/operationalTariffEngine";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const opPayload = {
  tariffs: {
    active: true,
    baseFare: 4.3,
    rateFirstPerKm: 3,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    pricePerMinute: 0.63,
    xlFixedSurchargeEur: 12,
    wheelchairFixedSurchargeEur: 5,
    byServiceRegion: {
      stuttgart: {
        xlFixedSurchargeEur: 99,
        wheelchairFixedSurchargeEur: 88,
        vehicleTariffOverrides: {
          wheelchair: { surchargeEur: 77 },
        },
      },
    },
  },
};

const { xlEur, wheelchairEur } = readPlatformVehicleSurchargeEur(opPayload.tariffs);
assert(xlEur === 12, `read xl expected 12 got ${xlEur}`);
assert(wheelchairEur === 5, `read wc expected 5 got ${wheelchairEur}`);

const { merged } = resolveMergedTariff(
  opPayload,
  [{ id: "stuttgart", label: "Stuttgart", isActive: true, matchTerms: ["stuttgart"], matchMode: "text" }],
  "Hauptbahnhof Stuttgart",
  { lat: 48.78, lon: 9.18 },
);
assert(merged.xlFixedSurchargeEur === 12, `merged xl expected 12 got ${merged.xlFixedSurchargeEur}`);
assert(merged.wheelchairFixedSurchargeEur === 5, `merged wc expected 5 got ${merged.wheelchairFixedSurchargeEur}`);

const xlEst = estimateTaxiFromMergedTariff(merged, {
  distanceKm: 10,
  tripMinutes: 20,
  waitingMinutes: 0,
  vehicle: "xl",
  at: new Date("2026-06-17T14:00:00+02:00"),
});
assert(
  xlEst.breakdown.xlFixedSurchargeEur === 12,
  `xl breakdown surcharge expected 12 got ${xlEst.breakdown.xlFixedSurchargeEur}`,
);

const stdTotal = estimateTaxiFromMergedTariff(merged, {
  distanceKm: 10,
  tripMinutes: 20,
  waitingMinutes: 0,
  vehicle: "standard",
  at: new Date("2026-06-17T14:00:00+02:00"),
}).finalRounded;
const wcTotal = estimateTaxiFromMergedTariff(merged, {
  distanceKm: 10,
  tripMinutes: 20,
  waitingMinutes: 0,
  vehicle: "wheelchair",
  at: new Date("2026-06-17T14:00:00+02:00"),
}).finalRounded;
assert(Math.abs(wcTotal - stdTotal - 5) < 0.02, `wheelchair delta expected ~5 got ${wcTotal - stdTotal}`);

const fpXl = computeFixedPriceVehicleSurchargeEur(opPayload, "xl");
const fpWc = computeFixedPriceVehicleSurchargeEur(opPayload, "wheelchair");
assert(fpXl === 12, `fixed price xl expected 12 got ${fpXl}`);
assert(fpWc === 5, `fixed price wc expected 5 got ${fpWc}`);

const forced = applyPlatformVehicleSurcharges(
  { xlFixedSurchargeEur: 1, wheelchairFixedSurchargeEur: 2 },
  { xlFixedSurchargeEur: 20, wheelchairFixedSurchargeEur: 8 },
);
assert(forced.xlFixedSurchargeEur === 20, "applyPlatform xl");
assert(forced.wheelchairFixedSurchargeEur === 8, "applyPlatform wc");

console.log("OK platform vehicle surcharge selftest");
