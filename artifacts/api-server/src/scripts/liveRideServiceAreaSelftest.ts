/**
 * Live-Anfrage: Abholort bundesweit (kein Servicegebiet). Reservierungen/Festpreis unverändert.
 *   npx tsx artifacts/api-server/src/scripts/liveRideServiceAreaSelftest.ts
 */
import { isFarFutureReservation, isLiveRideRequest, RESERVATION_LEAD_MS } from "../lib/dispatchStatus";
import {
  shouldBypassServiceAreaForFixedPriceReservation,
  validateFixedPriceReservationEndpoints,
} from "../lib/reservationFixedPricePolicy";
import { assertCustomerFromFullInActiveServiceRegion } from "../db/appOperationalData";
import { validateServiceAreaForRidePoints, type ServiceRegionMatchable } from "../lib/serviceRegionMatch";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const now = Date.UTC(2026, 8, 20, 12, 0, 0);
const iso = (deltaMs: number) => new Date(now + deltaMs).toISOString();

// Live = alles unterhalb 60 min Vorlauf (inkl. null / ungültig / Vergangenheit)
assert(isLiveRideRequest(null, now), "null ist live");
assert(isLiveRideRequest(undefined, now), "undefined ist live");
assert(isLiveRideRequest("kein-datum", now), "ungültiges Datum ist live (wie searching_driver)");
assert(isLiveRideRequest(iso(-5 * 60_000), now), "Vergangenheit ist live");
assert(isLiveRideRequest(iso(10 * 60_000), now), "+10 min ist live");
assert(isLiveRideRequest(iso(RESERVATION_LEAD_MS - 1), now), "+59:59 min ist live");
assert(!isLiveRideRequest(iso(RESERVATION_LEAD_MS), now), "+60 min ist Reservierung");
assert(!isLiveRideRequest(iso(3 * 60 * 60_000), now), "+3 h ist Reservierung");
for (const d of [null, iso(0), iso(30 * 60_000), iso(RESERVATION_LEAD_MS), iso(86_400_000)]) {
  assert(isLiveRideRequest(d, now) === !isFarFutureReservation(d, now), "live == !farFuture");
}

// Servicegebiet-Prüfung selbst bleibt unverändert streng (gilt weiter für Taxameter-Reservierungen)
const stuttgartRegion: ServiceRegionMatchable = {
  id: "asr-stuttgart",
  matchTerms: ["stuttgart"],
  isActive: true,
  matchMode: "substring",
  centerLat: null,
  centerLng: null,
  radiusKm: null,
};
assert(
  !validateServiceAreaForRidePoints("Alexanderplatz 1, Berlin", "Stuttgart Hbf", 52.52, 13.41, 48.78, 9.18, [stuttgartRegion]),
  "Abholort Berlin bleibt für Reservierung außerhalb Servicegebiet",
);
assert(
  validateServiceAreaForRidePoints("Königstraße 1, Stuttgart", "Berlin", 48.78, 9.18, 52.52, 13.41, [stuttgartRegion]),
  "Abholort Stuttgart ok",
);

// Deaktivierte Service-Region bleibt bewusst gesperrt (gilt vor der Live-/Reservierungs-Weiche in POST /rides)
{
  const disabled = { ...stuttgartRegion, id: "asr-sperr", matchTerms: ["sperrstadt"], isActive: false };
  const regions = [stuttgartRegion, disabled] as unknown as Parameters<typeof assertCustomerFromFullInActiveServiceRegion>[2];
  const blocked = assertCustomerFromFullInActiveServiceRegion("Hauptstr. 1, Sperrstadt", {}, regions);
  assert(!blocked.ok && blocked.error === "service_region_inactive", "deaktivierte Region: service_region_inactive");
  const free = assertCustomerFromFullInActiveServiceRegion("Alexanderplatz 1, Berlin", {}, regions);
  assert(free.ok, "Berlin (keine Region definiert) nicht durch Deaktiviert-Gate blockiert");
}

// Festpreis-Logik unverändert
assert(
  shouldBypassServiceAreaForFixedPriceReservation("fixed_price", new Date(Date.now() + 2 * 3600_000).toISOString()),
  "Festpreis+Reservierung bypass unverändert",
);
assert(
  !shouldBypassServiceAreaForFixedPriceReservation("fixed_price", null),
  "Festpreis ohne Termin: kein bypass (Server lehnt fixed_price_reservation_only ab)",
);
const berlin = { displayName: "Berlin", city: "Berlin", lat: 52.52, lon: 13.4 };
const munich = { displayName: "München", city: "München", lat: 48.14, lon: 11.58 };
const v = validateFixedPriceReservationEndpoints(berlin, munich);
assert(!v.ok && v.error === "reservation_outside_bw", "Festpreis ohne Stuttgart außerhalb BW bleibt gesperrt");

console.log("liveRideServiceAreaSelftest: OK");
