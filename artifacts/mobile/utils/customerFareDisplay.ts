import type { VehicleType } from "@/context/RideContext";
import type { FareEstimateApiBreakdown, FareEstimateApiResult } from "@/utils/fareEstimateApi";

export const CUSTOMER_TAXAMETER_LABEL = "Taxameter";

export function isCustomerSurchargeVehicle(vehicle: string | null | undefined): boolean {
  const v = vehicleIdFromRideLabel(vehicle);
  return v === "xl" || v === "wheelchair";
}

export function vehicleIdFromRideLabel(label: string | null | undefined): VehicleType {
  const l = (label ?? "").trim().toLowerCase();
  if (l.includes("rollstuhl") || l.includes("wheelchair")) return "wheelchair";
  if (l.includes("xl")) return "xl";
  return "standard";
}

/** Aufschlag XL/Rollstuhl vs. Standard-Taxameter (nur Anzeige, kein verbindlicher Preis). */
export function vehicleSurchargeFromEstimates(
  vehicle: string,
  estimate: Pick<FareEstimateApiResult, "total" | "breakdown"> | null,
  standardTotal: number | null,
): number | null {
  if (!isCustomerSurchargeVehicle(vehicle) || !estimate) return null;

  const breakdown = estimate.breakdown as FareEstimateApiBreakdown | undefined;
  const fixedXl = breakdown?.xlFixedSurchargeEur;
  if (typeof fixedXl === "number" && Number.isFinite(fixedXl) && fixedXl > 0) {
    return Math.round(fixedXl * 100) / 100;
  }

  if (standardTotal != null && Number.isFinite(standardTotal) && estimate.total > standardTotal + 0.009) {
    return Math.round((estimate.total - standardTotal) * 100) / 100;
  }

  return null;
}

export function customerVehicleSurchargeLabel(opts: {
  vehicle?: string | null | undefined;
  surchargeEur?: number | null | undefined;
}): string | null {
  if (opts.vehicle != null && isCustomerSurchargeVehicle(opts.vehicle)) {
    return "+ Aufschlag";
  }
  if (opts.surchargeEur != null && Number.isFinite(opts.surchargeEur) && opts.surchargeEur > 0) {
    return "+ Aufschlag";
  }
  return null;
}

export type CustomerFareDisplayLines = {
  primary: string;
  secondary?: string;
};

/** Kunden-UI: kein Euro-Preis — Standard = Taxameter; XL/Rollstuhl nur Aufschlag-Zeile. */
export function customerFareDisplayLines(opts: {
  vehicle: string | null | undefined;
  surchargeEur?: number | null;
  walletHint?: boolean;
}): CustomerFareDisplayLines {
  const surcharge = customerVehicleSurchargeLabel({
    vehicle: opts.vehicle,
    surchargeEur: opts.surchargeEur,
  });
  const lines: CustomerFareDisplayLines = {
    primary: CUSTOMER_TAXAMETER_LABEL,
  };
  if (surcharge) {
    lines.secondary = surcharge;
  } else if (opts.walletHint) {
    lines.secondary = "Abbuchung nach Fahrtende";
  }
  return lines;
}
