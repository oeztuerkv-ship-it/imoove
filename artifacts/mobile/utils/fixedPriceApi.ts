import { getApiBaseUrl } from "@/utils/apiBase";

const API_URL = getApiBaseUrl();

export type FixedPriceEstimateResult =
  | {
      ok: true;
      eligible: true;
      pricingMode: "fixed_price";
      priceEur: number;
      basePriceEur: number;
      vehicleSurchargeEur: number;
      distanceKm: number;
      baseFeeEur: number;
      perKmEur: number;
      distanceChargeEur: number;
    }
  | {
      ok: true;
      eligible: false;
      reason: string;
      message: string;
    }
  | { ok: false; error: string };

export async function fetchFixedPriceEstimate(body: {
  fromFull: string;
  toFull: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distanceKm: number;
  fromCity?: string | null;
  toCity?: string | null;
  vehicle?: string;
}): Promise<FixedPriceEstimateResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured" };
  }
  const q = new URLSearchParams({
    fromFull: body.fromFull.trim(),
    toFull: body.toFull.trim(),
    fromLat: String(body.fromLat),
    fromLon: String(body.fromLon),
    toLat: String(body.toLat),
    toLon: String(body.toLon),
    distanceKm: String(body.distanceKm),
  });
  if (body.fromCity?.trim()) q.set("fromCity", body.fromCity.trim());
  if (body.toCity?.trim()) q.set("toCity", body.toCity.trim());
  if (body.vehicle?.trim()) q.set("vehicle", body.vehicle.trim());
  const res = await fetch(`${API_URL}/fixed-price-estimate?${q.toString()}`);
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "estimate_failed" };
  }
  if (data.eligible === true) {
    return {
      ok: true,
      eligible: true,
      pricingMode: "fixed_price",
      priceEur: Number(data.priceEur),
      basePriceEur: Number(data.basePriceEur ?? data.priceEur),
      vehicleSurchargeEur: Number(data.vehicleSurchargeEur ?? 0),
      distanceKm: Number(data.distanceKm),
      baseFeeEur: Number(data.baseFeeEur),
      perKmEur: Number(data.perKmEur),
      distanceChargeEur: Number(data.distanceChargeEur),
    };
  }
  return {
    ok: true,
    eligible: false,
    reason: typeof data.reason === "string" ? data.reason : "not_eligible",
    message:
      typeof data.message === "string"
        ? data.message
        : "Festpreis für diese Strecke nicht verfügbar.",
  };
}

export const CUSTOMER_FIXED_PRICE_AGREEMENT_DE =
  "Mit „Festpreis reservieren“ vereinbarst du verbindlich den angezeigten Gesamtpreis für diese Fahrt (Fahrpreisvereinbarung).";
