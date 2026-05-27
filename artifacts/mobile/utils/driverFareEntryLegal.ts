import {
  formatMultiplierDe,
  normalizeDriverVehicleClass,
  type VehicleClassId,
  vehicleClassMultipliersFromTariffs,
} from "@/utils/vehicleClassMultipliers";

export type DriverFareLegalHintKind = "mandatory" | "surcharge";

export type DriverFareLegalHint = {
  id: string;
  kind: DriverFareLegalHintKind;
  body: string;
  highlight?: string;
};

export type DriverFareLegalHintContext = {
  vehicle?: string | null;
  mayBillPositive: boolean;
  /** Admin-Tarif aus App-Config (`tariffs`). */
  tariffs?: Record<string, unknown> | null;
  /** Buchungs-Snapshot: `breakdown.vehicleClassMultiplier` (bevorzugt für diese Fahrt). */
  snapshotVehicleClassMultiplier?: number | null;
};

function multiplierForVehicleClass(
  vehicleClass: VehicleClassId,
  tariffs: Record<string, unknown> | null | undefined,
  snapshotVehicleClassMultiplier?: number | null,
): number {
  if (
    snapshotVehicleClassMultiplier != null &&
    Number.isFinite(snapshotVehicleClassMultiplier) &&
    snapshotVehicleClassMultiplier > 0
  ) {
    return snapshotVehicleClassMultiplier;
  }
  const mults = vehicleClassMultipliersFromTariffs(tariffs);
  return mults[vehicleClass] ?? mults.standard;
}

/** Aufpreis-Hinweis für XL / Rollstuhl (Faktor aus Admin/API/Snapshot). */
export function driverFareVehicleSurchargeHint(ctx: DriverFareLegalHintContext): string | null {
  const kind = normalizeDriverVehicleClass(ctx.vehicle);
  if (kind === "standard" || kind === "onroda") return null;
  const mult = multiplierForVehicleClass(kind, ctx.tariffs, ctx.snapshotVehicleClassMultiplier);
  if (kind === "xl") {
    return `XL-Fahrt: Der Schätzpreis enthält einen Aufpreis (Faktor ${formatMultiplierDe(mult)}). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
  }
  return `Rollstuhl-Fahrt: Der Schätzpreis enthält einen Aufpreis (Faktor ${formatMultiplierDe(mult)}). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
}

export function driverFareEntryLegalHints(ctx: DriverFareLegalHintContext): DriverFareLegalHint[] {
  if (!ctx.mayBillPositive) return [];

  const hints: DriverFareLegalHint[] = [
    {
      id: "taxameter-mandatory",
      kind: "mandatory",
      highlight: "Taxameter",
      body: "Gesetzliche Pflicht: Den Betrag vom Taxameter übernehmen (amtlicher Endpreis auf dem Gerät). Nicht schätzen oder frei erfinden.",
    },
  ];

  const surcharge = driverFareVehicleSurchargeHint(ctx);
  if (surcharge) {
    hints.push({ id: "vehicle-surcharge", kind: "surcharge", body: surcharge, highlight: "Taxameter" });
  }

  return hints;
}
