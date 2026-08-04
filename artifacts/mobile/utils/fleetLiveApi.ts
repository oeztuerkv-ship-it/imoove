import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/utils/apiBase";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const API_BASE = getApiBaseUrl();

export type FleetLiveDriver = {
  id: string;
  lat: number;
  lon: number;
  updatedAt: string;
};

export type FleetLiveSnapshot = {
  onlineCount: number;
  drivers: FleetLiveDriver[];
};

async function fleetAuthHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

function normalizeDriver(raw: unknown): FleetLiveDriver | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lon = typeof o.lon === "number" ? o.lon : Number(o.lon);
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : "";
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { id, lat, lon, updatedAt };
}

/** Owner-only: Live-Online-Flotte der eigenen Firma. */
export async function fetchFleetLive(): Promise<
  { ok: true; snapshot: FleetLiveSnapshot } | { ok: false; error: string; status?: number }
> {
  try {
    const res = await fetch(`${API_BASE}/fleet-driver/v1/fleet-live`, {
      headers: await fleetAuthHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      onlineCount?: number;
      drivers?: unknown[];
    };
    if (res.status === 403) {
      return { ok: false, error: "owner_only", status: 403 };
    }
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: typeof data?.error === "string" ? data.error : "load_failed",
        status: res.status,
      };
    }
    const drivers = Array.isArray(data.drivers)
      ? data.drivers.map(normalizeDriver).filter((d): d is FleetLiveDriver => d != null)
      : [];
    const onlineCount =
      typeof data.onlineCount === "number" && Number.isFinite(data.onlineCount)
        ? Math.max(0, Math.floor(data.onlineCount))
        : drivers.length;
    return { ok: true, snapshot: { onlineCount, drivers } };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
