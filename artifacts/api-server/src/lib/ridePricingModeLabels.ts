import type { RideRequest } from "../domain/rideRequest.js";

export const CUSTOMER_TAXAMETER_LABEL = "Taxameter";
export const CUSTOMER_FIXED_PRICE_LABEL = "Festpreis";

export function isRideFixedPrice(
  pricingMode: RideRequest["pricingMode"] | string | null | undefined,
): boolean {
  return String(pricingMode ?? "").trim() === "fixed_price";
}

/** Kurzlabel für Abrechnungsart (Taxameter vs. Festpreis). */
export function customerFareModeLabel(
  pricingMode: RideRequest["pricingMode"] | string | null | undefined,
): string {
  return isRideFixedPrice(pricingMode) ? CUSTOMER_FIXED_PRICE_LABEL : CUSTOMER_TAXAMETER_LABEL;
}

/** Zeile „Fahrtpreis (…)“ in Kunden-UI. */
export function customerFarePriceRowLabel(
  pricingMode: RideRequest["pricingMode"] | string | null | undefined,
): string {
  return `Fahrtpreis (${customerFareModeLabel(pricingMode)})`;
}

/** Brutto-Zeile in HTML/PDF-Quittung. */
export function customerReceiptBruttoLabel(
  pricingMode: RideRequest["pricingMode"] | string | null | undefined,
): string {
  return `Brutto (${customerFareModeLabel(pricingMode)})`;
}

/** Fahrer-Umsatzzeile „Fahrpreis (…)“. */
export function driverEarningsFareLabel(
  pricingMode: RideRequest["pricingMode"] | string | null | undefined,
): string {
  return `Fahrpreis (${customerFareModeLabel(pricingMode)})`;
}
