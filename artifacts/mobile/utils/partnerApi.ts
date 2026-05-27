import { getApiBaseUrl, fetchErrorMessage } from "@/utils/apiBase";
import type { PartnerMeUser } from "@/utils/partnerMobileAccess";

export type PartnerLoginResult =
  | { ok: true; token: string; passwordChangeRequired: boolean }
  | { ok: false; message: string };

export type PartnerRideRow = {
  id: string;
  status: string;
  customerName?: string;
  from?: string;
  fromFull?: string;
  to?: string;
  toFull?: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  driverId?: string | null;
  estimatedFare?: number | null;
};

export type PartnerTrackingSnapshot = {
  ride: {
    id: string;
    status: string;
    pickupLabel: string;
    fromLat?: number | null;
    fromLon?: number | null;
  };
  driver: {
    id: string;
    name: string | null;
    plate: string | null;
    location: { lat: number; lon: number } | null;
  } | null;
};

type PartnerApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; unauthorized: boolean; forbidden: boolean; message: string };

async function partnerAuthedJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<PartnerApiResult<T>> {
  const base = getApiBaseUrl();
  if (!base) return { ok: false, unauthorized: false, forbidden: false, message: "API-URL fehlt." };

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    return { ok: false, unauthorized: true, forbidden: false, message: "Sitzung abgelaufen." };
  }
  if (res.status === 403) {
    return { ok: false, unauthorized: false, forbidden: true, message: "Kein Zugriff auf diese Fahrt." };
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = (data as { error?: string }).error;
    return {
      ok: false,
      unauthorized: false,
      forbidden: false,
      message: typeof err === "string" ? err : await fetchErrorMessage(res, "Anfrage fehlgeschlagen."),
    };
  }
  return { ok: true, data };
}

export async function partnerPanelLogin(username: string, password: string): Promise<PartnerLoginResult> {
  const base = getApiBaseUrl();
  if (!base) return { ok: false, message: "API-URL fehlt." };

  const res = await fetch(`${base}/panel-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (data.error === "invalid_credentials") {
      return { ok: false, message: "E-Mail oder Passwort ist ungültig." };
    }
    if (data.error === "rate_limited") {
      return { ok: false, message: "Zu viele Versuche. Bitte kurz warten." };
    }
    return { ok: false, message: await fetchErrorMessage(res, "Anmeldung fehlgeschlagen.") };
  }
  const token = typeof data.token === "string" ? data.token : "";
  if (!token) return { ok: false, message: "Kein Token von der API erhalten." };
  return {
    ok: true,
    token,
    passwordChangeRequired: data.passwordChangeRequired === true,
  };
}

export async function partnerFetchMe(token: string): Promise<PartnerMeUser | null> {
  const r = await partnerAuthedJson<{ ok?: boolean; user?: PartnerMeUser }>(token, "/panel/v1/me");
  if (!r.ok) return null;
  if (!r.data.ok || !r.data.user) return null;
  return r.data.user;
}

export async function partnerCreateRide(
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; ride: PartnerRideRow } | { ok: false; message: string; unauthorized?: boolean }> {
  const base = getApiBaseUrl();
  if (!base) return { ok: false, message: "API-URL fehlt." };

  const res = await fetch(`${base}/panel/v1/rides`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    return { ok: false, unauthorized: true, message: "Sitzung abgelaufen." };
  }
  if (res.status === 403) {
    return { ok: false, message: "Keine Berechtigung für diese Aktion." };
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; ride?: PartnerRideRow; error?: string };
  if (!res.ok) {
    const hint =
      data.error === "route_fields_required"
        ? "Route unvollständig."
        : data.error === "customer_name_required"
          ? "Kundenname fehlt."
          : data.error === "pricing_or_vehicle_invalid"
            ? "Preis oder Fahrzeug ungültig."
            : data.error === "estimated_fare_mismatch"
              ? "Preisabweichung — bitte erneut versuchen."
              : null;
    return {
      ok: false,
      message: hint ?? (typeof data.error === "string" ? data.error : await fetchErrorMessage(res, "Buchung fehlgeschlagen.")),
    };
  }
  if (!data.ride?.id) return { ok: false, message: "Ungültige API-Antwort." };
  return { ok: true, ride: data.ride };
}

export async function partnerFetchTracking(
  token: string,
  rideId: string,
): Promise<PartnerApiResult<PartnerTrackingSnapshot>> {
  const r = await partnerAuthedJson<{
    ok?: boolean;
    ride?: PartnerTrackingSnapshot["ride"];
    driver?: PartnerTrackingSnapshot["driver"];
  }>(token, `/panel/v1/rides/${encodeURIComponent(rideId)}/tracking`);
  if (!r.ok) return r;
  if (!r.data.ok || !r.data.ride) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Tracking nicht verfügbar." };
  }
  const ride = r.data.ride;
  return {
    ok: true,
    data: {
      ride: {
        id: ride.id,
        status: ride.status,
        pickupLabel: String(ride.pickupLabel ?? "").trim(),
        fromLat: ride.fromLat ?? null,
        fromLon: ride.fromLon ?? null,
      },
      driver: r.data.driver ?? null,
    },
  };
}
