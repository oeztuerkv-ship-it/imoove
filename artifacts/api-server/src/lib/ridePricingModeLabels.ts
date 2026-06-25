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

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Vereinbarter Festpreis beim Abschluss (Meta oder estimatedFare). */
export function resolveFixedPriceAgreedEur(
  ride: Pick<RideRequest, "estimatedFare" | "pricingMode" | "partnerBookingMeta">,
): number | null {
  if (!isRideFixedPrice(ride.pricingMode)) return null;
  const meta = ride.partnerBookingMeta as Record<string, unknown> | null | undefined;
  const fromMeta = meta?.fixed_price_agreed_eur;
  if (fromMeta != null && Number.isFinite(Number(fromMeta)) && Number(fromMeta) > 0) {
    return roundMoney(Number(fromMeta));
  }
  const est = Number(ride.estimatedFare);
  if (Number.isFinite(est) && est > 0) return roundMoney(est);
  return null;
}
