import type { VehicleType } from "@/context/RideContext";
import type { FareEstimateApiBreakdown, FareEstimateApiResult } from "@/utils/fareEstimateApi";
import { formatEuro } from "@/utils/fareCalculator";

export const CUSTOMER_TAXAMETER_LABEL = "Taxameter";
export const CUSTOMER_FIXED_PRICE_LABEL = "Festpreis";

export function isRideFixedPrice(pricingMode: string | null | undefined): boolean {
  return String(pricingMode ?? "").trim() === "fixed_price";
}

/** Kurzlabel für Abrechnungsart (Taxameter vs. Festpreis). */
export function customerFareModeLabel(pricingMode: string | null | undefined): string {
  return isRideFixedPrice(pricingMode) ? CUSTOMER_FIXED_PRICE_LABEL : CUSTOMER_TAXAMETER_LABEL;
}

/** Zeile „Fahrtpreis (…)“ in Kunden-UI. */
export function customerFarePriceRowLabel(pricingMode: string | null | undefined): string {
  return `Fahrtpreis (${customerFareModeLabel(pricingMode)})`;
}

/** Brutto-Zeile in Quittungs-PDF/HTML (API-Spiegel). */
export function customerReceiptBruttoLabel(pricingMode: string | null | undefined): string {
  return `Brutto (${customerFareModeLabel(pricingMode)})`;
}

/** Fahrer-Umsatzzeile „Fahrpreis (…)“. */
export function driverEarningsFareLabel(pricingMode: string | null | undefined): string {
  return `Fahrpreis (${customerFareModeLabel(pricingMode)})`;
}

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
  const fixedWc = (breakdown as { wheelchairFixedSurchargeEur?: number } | undefined)?.wheelchairFixedSurchargeEur;
  if (typeof fixedWc === "number" && Number.isFinite(fixedWc) && fixedWc > 0) {
    return Math.round(fixedWc * 100) / 100;
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
  const amount = opts.surchargeEur != null && Number.isFinite(opts.surchargeEur) ? opts.surchargeEur : 0;
  if (amount > 0) {
    return `+ ${formatEuro(amount)} Aufschlag`;
  }
  return null;
}

export type CustomerFareDisplayLines = {
  primary: string;
  secondary?: string;
};

/** Kunden-UI: Taxameter ohne Euro; Festpreis mit Betrag; XL/Rollstuhl optional + Aufschlag. */
export function customerFareDisplayLines(opts: {
  vehicle: string | null | undefined;
  surchargeEur?: number | null;
  walletHint?: boolean;
  pricingMode?: string | null;
  priceEur?: number | null;
}): CustomerFareDisplayLines {
  if (isRideFixedPrice(opts.pricingMode)) {
    const lines: CustomerFareDisplayLines = {
      primary: CUSTOMER_FIXED_PRICE_LABEL,
    };
    if (opts.priceEur != null && Number.isFinite(opts.priceEur) && opts.priceEur > 0) {
      lines.secondary = formatEuro(opts.priceEur);
    }
    return lines;
  }

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
