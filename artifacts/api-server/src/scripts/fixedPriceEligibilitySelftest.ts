import { evaluateFixedPriceEligibility } from "../lib/fixedPriceMandatoryArea";
import { isMandatoryTaxiAreaLocation } from "../lib/mandatoryTaxiArea";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const cities = ["Stuttgart", "Esslingen"];

assert(
  isMandatoryTaxiAreaLocation({ displayName: "Marktplatz, Nürtingen", city: "Nürtingen" }),
  "Nürtingen im Landkreis",
);
assert(
  isMandatoryTaxiAreaLocation({ displayName: "Bahnhof, Ostfildern", city: "Ostfildern" }),
  "Ostfildern im Landkreis",
);
assert(
  isMandatoryTaxiAreaLocation({ displayName: "Hauptstraße, Baltmannsweiler", city: "Baltmannsweiler" }),
  "Baltmannsweiler im Landkreis",
);
assert(
  !isMandatoryTaxiAreaLocation({ displayName: "Bahnhof, Tübingen", city: "Tübingen" }),
  "Tübingen außerhalb",
);

const blocked = evaluateFixedPriceEligibility({
  from: { displayName: "Nürtingen", city: "Nürtingen" },
  to: { displayName: "Ostfildern", city: "Ostfildern" },
  mandatoryCities: cities,
});
assert(!blocked.eligible && blocked.reason === "both_in_mandatory_area", "Nürtingen↔Ostfildern blockiert");

const allowedCross = evaluateFixedPriceEligibility({
  from: { displayName: "Hauptbahnhof, Stuttgart", city: "Stuttgart" },
  to: { displayName: "Bahnhof, Tübingen", city: "Tübingen" },
  mandatoryCities: cities,
});
assert(allowedCross.eligible, "Stuttgart→Tübingen erlaubt (nur ein Punkt im Pflichtgebiet)");

const blockedStuttgartEsslingen = evaluateFixedPriceEligibility({
  from: { displayName: "Stuttgart Hbf", city: "Stuttgart" },
  to: { displayName: "Esslingen Hbf", city: "Esslingen am Neckar" },
  mandatoryCities: cities,
});
assert(!blockedStuttgartEsslingen.eligible, "Stuttgart↔Esslingen blockiert");

const blockedSameCity = evaluateFixedPriceEligibility({
  from: { displayName: "Uni Tübingen", city: "Tübingen" },
  to: { displayName: "Bahnhof Tübingen", city: "Tübingen" },
  mandatoryCities: cities,
});
assert(!blockedSameCity.eligible && blockedSameCity.reason === "same_city", "gleiche Stadt blockiert");

console.log("OK fixed price eligibility selftest");
