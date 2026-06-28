import { evaluateFixedPriceEligibility, type FixedPriceLocationPoint } from "../lib/fixedPriceMandatoryArea";
import { isMandatoryTaxiAreaLocation } from "../lib/mandatoryTaxiArea";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const cities = ["Stuttgart", "Esslingen"];

/** Photon-Ergebnisse (Live-Abfrage 2026-06) — Labels absichtlich „kaputt“, Koordinaten korrekt. */
const PHOTON_LEINFELDEN: FixedPriceLocationPoint = {
  displayName: "Leinfelden",
  city: "Oberaichen",
  lat: 48.6966965,
  lon: 9.1427508,
};

const PHOTON_FLUGHAFEN: FixedPriceLocationPoint = {
  displayName: "Flughafen Stuttgart",
  city: "Leinfelden-Echterdingen",
  lat: 48.688422,
  lon: 9.2053925,
};

const PHOTON_FLUGHAFEN_STUTTGART_CITY: FixedPriceLocationPoint = {
  displayName: "Stuttgart Flughafen/Messe",
  city: "Stuttgart",
  lat: 48.6904461,
  lon: 9.1926989,
};

type Case = {
  name: string;
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  expectEligible: boolean;
  expectReason?: "both_in_mandatory_area" | "same_city";
};

const cases: Case[] = [
  {
    name: "Leinfelden→Flughafen (Photon-Labels, Koordinaten)",
    from: PHOTON_LEINFELDEN,
    to: PHOTON_FLUGHAFEN,
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Leinfelden→Flughafen nur Text ohne Koordinaten (Fallback Oberaichen+LE)",
    from: { displayName: "Leinfelden", city: "Oberaichen" },
    to: { displayName: "Flughafen Stuttgart", city: "Leinfelden-Echterdingen" },
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Nürtingen→Ostfildern",
    from: { displayName: "Marktplatz, Nürtingen", city: "Nürtingen", lat: 48.626, lon: 9.34 },
    to: { displayName: "Bahnhof, Ostfildern", city: "Ostfildern", lat: 48.724, lon: 9.249 },
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Stuttgart→Esslingen",
    from: { displayName: "Hauptbahnhof, Stuttgart", city: "Stuttgart", lat: 48.783, lon: 9.18 },
    to: { displayName: "Esslingen Hbf", city: "Esslingen am Neckar", lat: 48.742, lon: 9.31 },
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Stuttgart→Tübingen (nur Start im Pflichtgebiet)",
    from: { displayName: "Hauptbahnhof, Stuttgart", city: "Stuttgart", lat: 48.783, lon: 9.18 },
    to: { displayName: "Bahnhof, Tübingen", city: "Tübingen", lat: 48.399, lon: 9.011 },
    expectEligible: true,
  },
  {
    name: "Tübingen→Flughafen (Ziel im Pflichtgebiet)",
    from: { displayName: "Uni Tübingen", city: "Tübingen", lat: 48.526, lon: 9.053 },
    to: PHOTON_FLUGHAFEN,
    expectEligible: true,
  },
  {
    name: "Tübingen→Tübingen gleiche Stadt",
    from: { displayName: "Uni", city: "Tübingen", lat: 48.526, lon: 9.053 },
    to: { displayName: "Bahnhof", city: "Tübingen", lat: 48.399, lon: 9.011 },
    expectEligible: false,
    expectReason: "same_city",
  },
  {
    name: "Nürtingen nur Ortsname ohne city-Label aber mit Koordinaten",
    from: { displayName: "Nürtingen", city: null, lat: 48.626, lon: 9.34 },
    to: { displayName: "Ostfildern", city: null, lat: 48.724, lon: 9.249 },
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Flughafen→Flughafen-Messe (Stuttgart city label, beide STR)",
    from: PHOTON_FLUGHAFEN,
    to: PHOTON_FLUGHAFEN_STUTTGART_CITY,
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Reutlingen→Ulm außerhalb",
    from: { displayName: "Reutlingen", city: "Reutlingen", lat: 48.492, lon: 9.204 },
    to: { displayName: "Ulm Hbf", city: "Ulm", lat: 48.399, lon: 9.982 },
    expectEligible: true,
  },
  {
    name: "Leinfelden→Stuttgart Innenstadt",
    from: PHOTON_LEINFELDEN,
    to: { displayName: "Schlossplatz", city: "Stuttgart", lat: 48.778, lon: 9.18 },
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
  {
    name: "Filderstadt→Leinfelden",
    from: { displayName: "Filderstadt", city: "Filderstadt", lat: 48.654, lon: 9.219 },
    to: PHOTON_LEINFELDEN,
    expectEligible: false,
    expectReason: "both_in_mandatory_area",
  },
];

assert(
  isMandatoryTaxiAreaLocation(PHOTON_LEINFELDEN),
  "Leinfelden-Koordinaten im Pflichtgebiet (city=Oberaichen)",
);
assert(
  isMandatoryTaxiAreaLocation(PHOTON_FLUGHAFEN),
  "Flughafen-Koordinaten im Pflichtgebiet",
);

for (const c of cases) {
  const r = evaluateFixedPriceEligibility({ from: c.from, to: c.to, mandatoryCities: cities });
  if (c.expectEligible) {
    assert(r.eligible, `${c.name}: erwartet eligible, got ${JSON.stringify(r)}`);
  } else {
    assert(!r.eligible, `${c.name}: erwartet blockiert, got eligible`);
    if (c.expectReason && !r.eligible) {
      assert(r.reason === c.expectReason, `${c.name}: reason ${r.reason} !== ${c.expectReason}`);
    }
  }
  console.log("OK ", c.name);
}

console.log(`OK fixed price eligibility selftest (${cases.length} Fälle)`);
