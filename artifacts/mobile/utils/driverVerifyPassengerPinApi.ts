import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/utils/apiBase";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const API_BASE = getApiBaseUrl();

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

export type VerifyPassengerPinOk = {
  ok: true;
  verifiedAt?: string;
  alreadyVerified?: boolean;
};

export type VerifyPassengerPinErr = {
  ok: false;
  error: string;
  message: string;
};

export async function verifyPassengerPinForRide(
  rideId: string,
  pin: string,
): Promise<VerifyPassengerPinOk | VerifyPassengerPinErr> {
  const res = await fetch(
    `${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/verify-passenger-pin`,
    {
      method: "POST",
      headers: await fleetAuthHeaders(),
      body: JSON.stringify({ pin }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    message?: string;
    verifiedAt?: string;
    alreadyVerified?: boolean;
  } | null;
  if (res.ok && body?.ok) {
    return {
      ok: true,
      verifiedAt: typeof body.verifiedAt === "string" ? body.verifiedAt : undefined,
      alreadyVerified: body.alreadyVerified === true,
    };
  }
  return {
    ok: false,
    error: typeof body?.error === "string" ? body.error : "passenger_pin_verify_failed",
    message:
      typeof body?.message === "string"
        ? body.message
        : "Code konnte nicht geprüft werden. Bitte erneut versuchen.",
  };
}

export async function fetchRidePassengerPinStatus(rideId: string): Promise<{
  required: boolean;
  verified: boolean;
  /** false = Live-Status nicht geladen — Caller soll Client-Heuristik behalten. */
  ok: boolean;
}> {
  try {
    const res = await fetch(
      `${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/live-status`,
      { headers: await fleetAuthHeaders() },
    );
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      passengerPinRequired?: boolean;
      passengerPinVerified?: boolean;
    } | null;
    if (!res.ok || !body?.ok) return { required: false, verified: false, ok: false };
    return {
      required: body.passengerPinRequired === true,
      verified: body.passengerPinVerified === true,
      ok: true,
    };
  } catch {
    return { required: false, verified: false, ok: false };
  }
}
