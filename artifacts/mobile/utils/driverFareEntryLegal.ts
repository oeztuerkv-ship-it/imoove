import {
  formatMultiplierDe,
  normalizeDriverVehicleClass,
  type VehicleClassId,
  vehicleClassMultipliersFromTariffs,
} from "@/utils/vehicleClassMultipliers";
import { formatEuro } from "@/utils/fareCalculator";

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
  /** Buchungs-Snapshot: `breakdown.xlFixedSurchargeEur` (Admin XL-Aufschlag). */
  snapshotXlFixedSurchargeEur?: number | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function xlFixedSurchargeEurFromTariffs(tariffs: Record<string, unknown> | null | undefined): number {
  if (!tariffs) return 0;
  const direct = num(tariffs.xlFixedSurchargeEur);
  if (direct != null && direct > 0) return direct;
  const lvs = tariffs.largeVehicleSurcharge;
  if (lvs && typeof lvs === "object" && !Array.isArray(lvs)) {
    const legacy = num((lvs as { amountEur?: unknown }).amountEur);
    if (legacy != null && legacy > 0) return legacy;
  }
  return 0;
}

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

/** Aufpreis-Hinweis für XL / Rollstuhl (Admin/API/Snapshot). */
export function driverFareVehicleSurchargeHint(ctx: DriverFareLegalHintContext): string | null {
  const kind = normalizeDriverVehicleClass(ctx.vehicle);
  if (kind === "standard" || kind === "onroda") return null;

  if (kind === "xl") {
    const snapFixed = num(ctx.snapshotXlFixedSurchargeEur);
    const fixed =
      snapFixed != null && snapFixed > 0 ? snapFixed : xlFixedSurchargeEurFromTariffs(ctx.tariffs);
    if (fixed > 0) {
      return `XL-Fahrt: Der Schätzpreis entspricht dem Standard-Tarif zzgl. ${formatEuro(fixed)} XL-Fahrzeugaufschlag (laut Betriebs-Konfiguration). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
    }
    const mult = multiplierForVehicleClass(kind, ctx.tariffs, ctx.snapshotVehicleClassMultiplier);
    if (mult > 1.001) {
      return `XL-Fahrt: Der Schätzpreis enthält einen Aufpreis (Faktor ${formatMultiplierDe(mult)}). Am Taxameter den tatsächlichen Endpreis inkl. aller Zuschläge eintragen.`;
    }
    return null;
  }

  const mult = multiplierForVehicleClass(kind, ctx.tariffs, ctx.snapshotVehicleClassMultiplier);
  if (mult <= 1.001) return null;
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
