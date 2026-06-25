import { getApiBaseUrl } from "./apiBase";

export type DriverRideEarnings = {
  gross: number;
  commission: number;
  tip: number;
  net: number;
  commissionRate: number;
  payoutAmount: number;
  actualDistanceKm: number | null;
  actualDurationMinutes: number | null;
  fromFull: string;
  toFull: string;
  vehicle: string;
  completedAt: string | null;
  pricingMode: "taxi_tariff" | "fixed_price" | null;
};

export async function fetchFleetDriverRideEarnings(
  rideId: string,
  authToken: string,
): Promise<DriverRideEarnings | null> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/earnings`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) return null;
    const gross = Number(data.gross);
    const commission = Number(data.commission);
    const tip = Number(data.tip);
    const net = Number(data.net);
    const commissionRate = Number(data.commissionRate);
    const payoutAmount = Number(data.payoutAmount);
    if (!Number.isFinite(gross) || !Number.isFinite(commission) || !Number.isFinite(net)) return null;
    const actualDistanceKm = Number(data.actualDistanceKm);
    const actualDurationMinutes = Number(data.actualDurationMinutes);
    return {
      gross,
      commission,
      tip: Number.isFinite(tip) ? tip : 0,
      net,
      commissionRate: Number.isFinite(commissionRate) ? commissionRate : 0,
      payoutAmount: Number.isFinite(payoutAmount) ? payoutAmount : Math.max(0, gross - commission),
      actualDistanceKm: Number.isFinite(actualDistanceKm) && actualDistanceKm > 0 ? actualDistanceKm : null,
      actualDurationMinutes:
        Number.isInteger(actualDurationMinutes) && actualDurationMinutes > 0 ? actualDurationMinutes : null,
      fromFull: typeof data.fromFull === "string" ? data.fromFull : "",
      toFull: typeof data.toFull === "string" ? data.toFull : "",
      vehicle: typeof data.vehicle === "string" ? data.vehicle : "standard",
      completedAt: typeof data.completedAt === "string" ? data.completedAt : null,
      pricingMode:
        data.pricingMode === "fixed_price"
          ? "fixed_price"
          : data.pricingMode === "taxi_tariff"
            ? "taxi_tariff"
            : null,
    };
  } catch {
    return null;
  }
}

export function formatEuroDe(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function formatDriverDistanceKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatDriverDurationMinutes(minutes: number): string {
  return `${minutes} Min.`;
}

const VEHICLE_LABELS: Record<string, string> = {
  standard: "Taxi",
  comfort: "Komfort",
  van: "Van",
  xl: "XL",
  wheelchair: "Rollstuhl",
};

export function formatDriverVehicleLabel(vehicle: string): string {
  const key = vehicle.trim().toLowerCase();
  return VEHICLE_LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Taxi");
}

export function formatDriverRideCompletedAt(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      date: now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };
  }
  return {
    date: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
  };
}
