import type { RideRequest } from "../domain/rideRequest";
import { computeFixedPriceRideBookingPricing } from "./fixedPriceBooking";
import { getOperationalConfigPayload } from "../db/appOperationalData";

/** Festpreis-Gutschein aus Access-Code-Meta auf Fahrt anwenden. */
export async function applyFixedPriceVoucherMetaToRide(
  ride: RideRequest,
  meta: Record<string, unknown>,
): Promise<RideRequest> {
  const fp = meta.fixedPriceVoucher;
  if (!fp || typeof fp !== "object" || Array.isArray(fp)) return ride;
  const rec = fp as Record<string, unknown>;
  const priceEur = Number(rec.priceEur);
  if (!Number.isFinite(priceEur) || priceEur <= 0) return ride;

  const fromFull = typeof rec.fromFull === "string" ? rec.fromFull.trim() : ride.fromFull;
  const toFull = typeof rec.toFull === "string" ? rec.toFull.trim() : ride.toFull;
  const distanceKm = Number(rec.distanceKm ?? ride.distanceKm ?? 0);
  const vehicle = typeof rec.vehicle === "string" ? rec.vehicle : ride.vehicle ?? "standard";

  const opPayload = await getOperationalConfigPayload();
  const priced = computeFixedPriceRideBookingPricing({
    opPayload,
    from: { displayName: fromFull },
    to: { displayName: toFull },
    distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : ride.distanceKm ?? 0,
    tripMinutes: ride.durationMinutes ?? 0,
    vehicle,
  });

  const snapshot = priced.ok ? priced.snapshot : ride.tariffSnapshot;
  const finalPrice = priced.ok ? priced.finalPrice : priceEur;

  return {
    ...ride,
    fromFull: fromFull || ride.fromFull,
    toFull: toFull || ride.toFull,
    pricingMode: "fixed_price",
    estimatedFare: finalPrice,
    distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : ride.distanceKm,
    vehicle,
    tariffSnapshot: snapshot ?? ride.tariffSnapshot,
    payerKind: ride.companyId ? "company" : ride.payerKind,
  };
}
