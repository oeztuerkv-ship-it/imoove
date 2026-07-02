import {
  evaluateReservationFixedPriceEligibility,
  isBothInMandatoryTaxiArea,
  isFixedPriceReservationRequest,
  isPointInBadenWuerttemberg,
  isPointInGermany,
  isStuttgartZonePoint,
  shouldBypassServiceAreaForFixedPriceReservation,
  validateFixedPriceReservationEndpoints,
} from "../lib/reservationFixedPricePolicy";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const opPayload = {
  tariffs: { fixedPriceOutsideActive: true, onrodaFixBase: 3.5, onrodaFixPerKm: 2.2 },
};

const STUTTGART = {
  displayName: "Hauptbahnhof, Stuttgart",
  city: "Stuttgart",
  lat: 48.783,
  lon: 9.18,
};
const MANNHEIM = {
  displayName: "Hauptbahnhof, Mannheim",
  city: "Mannheim",
  lat: 49.479,
  lon: 8.469,
};
const ESSLINGEN = {
  displayName: "Esslingen Hbf",
  city: "Esslingen am Neckar",
  lat: 48.742,
  lon: 9.31,
};
const TUEBINGEN = {
  displayName: "Bahnhof, Tübingen",
  city: "Tübingen",
  lat: 48.399,
  lon: 9.011,
};
const BERLIN = {
  displayName: "Hauptbahnhof, Berlin",
  city: "Berlin",
  lat: 52.525,
  lon: 13.369,
};
const MUNICH = {
  displayName: "Hauptbahnhof, München",
  city: "München",
  lat: 48.14,
  lon: 11.56,
};

assert(isBothInMandatoryTaxiArea(STUTTGART, ESSLINGEN), "Stuttgart+Esslingen = Pflichtgebiet");
assert(!isBothInMandatoryTaxiArea(STUTTGART, MANNHEIM), "Stuttgart+Mannheim nicht beide Pflichtgebiet");

const stuttgartMannheim = evaluateReservationFixedPriceEligibility({
  opPayload,
  from: STUTTGART,
  to: MANNHEIM,
  distanceKm: 120,
});
assert(stuttgartMannheim.eligible, "Stuttgart→Mannheim Festpreis-Reservierung eligible");

const mannheimStuttgart = evaluateReservationFixedPriceEligibility({
  opPayload,
  from: MANNHEIM,
  to: STUTTGART,
  distanceKm: 120,
});
assert(mannheimStuttgart.eligible, "Mannheim→Stuttgart Festpreis-Reservierung eligible");

const esslingenStuttgart = evaluateReservationFixedPriceEligibility({
  opPayload,
  from: ESSLINGEN,
  to: STUTTGART,
  distanceKm: 15,
});
assert(!esslingenStuttgart.eligible, "Esslingen→Stuttgart kein Festpreis (Pflichtgebiet)");
assert(
  esslingenStuttgart.reason === "both_in_mandatory_area",
  "Esslingen→Stuttgart reason both_in_mandatory_area",
);

const tuebingenStuttgart = evaluateReservationFixedPriceEligibility({
  opPayload,
  from: TUEBINGEN,
  to: STUTTGART,
  distanceKm: 40,
});
assert(tuebingenStuttgart.eligible, "Tübingen→Stuttgart Festpreis eligible");

const berlinStuttgart = evaluateReservationFixedPriceEligibility({
  opPayload,
  from: BERLIN,
  to: STUTTGART,
  distanceKm: 510,
});
assert(berlinStuttgart.eligible, "Berlin→Stuttgart Festpreis eligible (Stuttgart-Ausnahme)");

assert(isPointInBadenWuerttemberg(MANNHEIM.lat, MANNHEIM.lon), "Mannheim in BW");
assert(!isPointInBadenWuerttemberg(50.1, 8.27), "Kassel nicht in BW");
assert(isPointInGermany(BERLIN.lat, BERLIN.lon), "Berlin in DE");
assert(!isPointInGermany(48.85, 2.35), "Paris nicht in DE");
assert(isStuttgartZonePoint(STUTTGART), "Stuttgart Hbf = Stuttgart-Zone");
assert(!isStuttgartZonePoint(ESSLINGEN), "Esslingen allein ≠ Stuttgart-Zone");

const bwOk = validateFixedPriceReservationEndpoints(MANNHEIM, STUTTGART);
assert(bwOk.ok, "Mannheim↔Stuttgart BW validation ok");

const berlinStuttgartGeo = validateFixedPriceReservationEndpoints(BERLIN, STUTTGART);
assert(berlinStuttgartGeo.ok, "Berlin→Stuttgart Geografie ok (bundesweit nach Stuttgart)");

const stuttgartBerlinGeo = validateFixedPriceReservationEndpoints(STUTTGART, BERLIN);
assert(stuttgartBerlinGeo.ok, "Stuttgart→Berlin Geografie ok (Stuttgart-Ausnahme bidirektional)");

const munichStuttgartGeo = validateFixedPriceReservationEndpoints(MUNICH, STUTTGART);
assert(munichStuttgartGeo.ok, "München→Stuttgart Geografie ok");

const berlinMunichGeo = validateFixedPriceReservationEndpoints(BERLIN, MUNICH);
assert(!berlinMunichGeo.ok, "Berlin→München ohne Stuttgart nicht erlaubt");
assert(berlinMunichGeo.error === "reservation_outside_bw", "Berlin→München error reservation_outside_bw");

const sched = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
assert(
  shouldBypassServiceAreaForFixedPriceReservation("fixed_price", sched),
  "Festpreis+Reservierung bypass service area",
);
assert(
  !shouldBypassServiceAreaForFixedPriceReservation("taxi_tariff", sched),
  "Taxameter+Reservierung kein bypass",
);
assert(
  !isFixedPriceReservationRequest("fixed_price", null),
  "Festpreis ohne Termin ist keine Reservierung",
);

console.log("reservationFixedPricePolicySelftest: OK");
