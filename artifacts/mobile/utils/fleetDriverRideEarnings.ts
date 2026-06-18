import { getApiBaseUrl } from "./apiBase";

export type DriverRideEarnings = {
  gross: number;
  commission: number;
  tip: number;
  net: number;
  commissionRate: number;
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
    if (!Number.isFinite(gross) || !Number.isFinite(commission) || !Number.isFinite(net)) return null;
    return {
      gross,
      commission,
      tip: Number.isFinite(tip) ? tip : 0,
      net,
      commissionRate: Number.isFinite(commissionRate) ? commissionRate : 0,
    };
  } catch {
    return null;
  }
}

export function formatEuroDe(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}
