import { VEHICLES } from "@/context/RideContext";

export type DriverFareLegalHintKind = "mandatory" | "surcharge";

export type DriverFareLegalHint = {
  id: string;
  kind: DriverFareLegalHintKind;
  /** Volltext; `highlight` wird fett gesetzt (z. B. „Taxameter“). */
  body: string;
  highlight?: string;
};

export type DriverVehicleFareClass = "standard" | "xl" | "wheelchair";

/** API-/Anzeige-String → Fahrzeugklasse für Aufpreis-Hinweise. */
export function normalizeDriverVehicleFareClass(
  vehicle: string | null | undefined,
): DriverVehicleFareClass {
  const v = (vehicle ?? "").toLowerCase().trim();
  if (v === "xl" || v.includes("xl") || v.includes("van") || v.includes("6 person")) return "xl";
  if (v === "wheelchair" || v.includes("rollstuhl") || v.includes("wheelchair")) return "wheelchair";
  return "standard";
}

function formatMultiplierDe(multiplier: number): string {
  return multiplier.toFixed(1).replace(".", ",");
}

/** Aufpreis-Hinweis für XL / Rollstuhl (Schätzpreis ≠ Taxameter-Endpreis). */
export function driverFareVehicleSurchargeHint(vehicle: string | null | undefined): string | null {
  const kind = normalizeDriverVehicleFareClass(vehicle);
  if (kind === "xl") {
    const mult = VEHICLES.find((x) => x.id === "xl")?.multiplier ?? 1.6;
    return `XL-Fahrt: Der Schätzpreis enthält einen Aufpreis (Faktor ${formatMultiplierDe(mult)}). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
  }
  if (kind === "wheelchair") {
    const mult = VEHICLES.find((x) => x.id === "wheelchair")?.multiplier ?? 1.8;
    return `Rollstuhl-Fahrt: Der Schätzpreis enthält einen Aufpreis (Faktor ${formatMultiplierDe(mult)}). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
  }
  return null;
}

/** Hinweise für Fahrer-Preiseingabe (nur wenn positive Abrechnung erlaubt). */
export function driverFareEntryLegalHints(
  vehicle: string | null | undefined,
  mayBillPositive: boolean,
): DriverFareLegalHint[] {
  if (!mayBillPositive) return [];

  const hints: DriverFareLegalHint[] = [
    {
      id: "taxameter-mandatory",
      kind: "mandatory",
      highlight: "Taxameter",
      body: "Gesetzliche Pflicht: Den Betrag vom Taxameter übernehmen (amtlicher Endpreis auf dem Gerät). Nicht schätzen oder frei erfinden.",
    },
  ];

  const surcharge = driverFareVehicleSurchargeHint(vehicle);
  if (surcharge) {
    hints.push({ id: "vehicle-surcharge", kind: "surcharge", body: surcharge, highlight: "Taxameter" });
  }

  return hints;
}
