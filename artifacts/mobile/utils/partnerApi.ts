import { getApiBaseUrl, fetchErrorMessage } from "@/utils/apiBase";
import type { PartnerMeUser } from "@/utils/partnerMobileAccess";
import { filterPartnerVisibleRides } from "@/utils/partnerRides";

export type PartnerLoginResult =
  | { ok: true; token: string; passwordChangeRequired: boolean }
  | { ok: false; message: string };

export type PartnerRideRow = {
  id: string;
  status: string;
  createdAt?: string;
  scheduledAt?: string | null;
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
  partnerBookingMeta?: Record<string, unknown> | null;
};

export type PartnerTrackingSnapshot = {
  ride: {
    id: string;
    status: string;
    createdAt?: string;
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
): Promise<
  | { ok: true; ride: PartnerRideRow }
  | { ok: false; message: string; unauthorized?: boolean; limitReached?: boolean }
> {
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
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    ride?: PartnerRideRow;
    error?: string;
    maxOpen?: number;
  };
  if (!res.ok) {
    if (data.error === "open_rides_limit_reached") {
      return {
        ok: false,
        limitReached: true,
        message: "Maximal 5 offene Fahrten gleichzeitig. Bitte zuerst eine Fahrt abschließen oder stornieren.",
      };
    }
    if (data.error === "scheduled_at_too_soon") {
      return {
        ok: false,
        message: "Reservierung mindestens 60 Minuten im Voraus wählen.",
      };
    }
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

export async function partnerFetchRides(
  token: string,
): Promise<PartnerApiResult<PartnerRideRow[]>> {
  const r = await partnerAuthedJson<{ ok?: boolean; rides?: PartnerRideRow[] }>(token, "/panel/v1/rides");
  if (!r.ok) return r;
  if (!r.data.ok || !Array.isArray(r.data.rides)) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Fahrten konnten nicht geladen werden." };
  }
  const raw = r.data.rides;
  const visible = filterPartnerVisibleRides(raw);
  console.log("[partnerApi] fetchRides filter", { raw: raw.length, visible: visible.length });
  return { ok: true, data: visible };
}

export async function partnerCancelRide(
  token: string,
  rideId: string,
  reason?: string,
): Promise<PartnerApiResult<PartnerRideRow>> {
  const r = await partnerAuthedJson<{ ok?: boolean; ride?: PartnerRideRow }>(
    token,
    `/panel/v1/rides/${encodeURIComponent(rideId)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason?.trim() ? { reason: reason.trim().slice(0, 200) } : {}),
    },
  );
  if (!r.ok) return r;
  if (!r.data.ok || !r.data.ride) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Storno fehlgeschlagen." };
  }
  return { ok: true, data: r.data.ride };
}

export async function partnerRetrySearch(
  token: string,
  rideId: string,
): Promise<PartnerApiResult<PartnerRideRow>> {
  const r = await partnerAuthedJson<{ ok?: boolean; ride?: PartnerRideRow }>(
    token,
    `/panel/v1/rides/${encodeURIComponent(rideId)}/retry-search`,
    { method: "POST" },
  );
  if (!r.ok) return r;
  if (!r.data.ok || !r.data.ride) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Erneute Suche fehlgeschlagen." };
  }
  return { ok: true, data: r.data.ride };
}

export async function partnerHideRide(
  token: string,
  rideId: string,
): Promise<PartnerApiResult<PartnerRideRow>> {
  const base = getApiBaseUrl();
  const path = `/panel/v1/rides/${encodeURIComponent(rideId)}/hide`;
  const url = base ? `${base}${path}` : path;
  console.log("[partnerApi] POST hide", url);

  const r = await partnerAuthedJson<{ ok?: boolean; ride?: PartnerRideRow }>(token, path, { method: "POST" });
  if (!r.ok) {
    console.log("[partnerApi] POST hide failed", rideId, r.message);
    return r;
  }
  if (!r.data.ok || !r.data.ride) {
    console.log("[partnerApi] POST hide invalid body", rideId);
    return { ok: false, unauthorized: false, forbidden: false, message: "Aus Liste entfernen fehlgeschlagen." };
  }
  console.log("[partnerApi] POST hide ok", rideId);
  return { ok: true, data: r.data.ride };
}

export type PartnerMessageRow = {
  id: string;
  companyId: string;
  subject: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  createdByAdmin: string;
};

export async function partnerFetchMessages(
  token: string,
): Promise<PartnerApiResult<PartnerMessageRow[]>> {
  const r = await partnerAuthedJson<{ ok?: boolean; items?: PartnerMessageRow[] }>(token, "/panel/v1/messages");
  if (!r.ok) return r;
  if (!r.data.ok) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Nachrichten konnten nicht geladen werden." };
  }
  return { ok: true, data: Array.isArray(r.data.items) ? r.data.items : [] };
}

export async function partnerFetchUnreadMessageCount(
  token: string,
): Promise<PartnerApiResult<number>> {
  const r = await partnerAuthedJson<{ ok?: boolean; count?: number }>(token, "/panel/v1/messages/unread-count");
  if (!r.ok) return r;
  if (!r.data.ok) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Zähler nicht verfügbar." };
  }
  const n = typeof r.data.count === "number" ? r.data.count : 0;
  return { ok: true, data: Math.max(0, n) };
}

export async function partnerMarkMessageRead(
  token: string,
  messageId: string,
): Promise<PartnerApiResult<PartnerMessageRow>> {
  const r = await partnerAuthedJson<{ ok?: boolean; item?: PartnerMessageRow }>(
    token,
    `/panel/v1/messages/${encodeURIComponent(messageId)}/read`,
    { method: "PATCH" },
  );
  if (!r.ok) return r;
  if (!r.data.ok || !r.data.item) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Als gelesen markieren fehlgeschlagen." };
  }
  return { ok: true, data: r.data.item };
}

function partnerDeleteMessageErrorHint(message: string): string {
  if (message === "not_found") return "Nachricht nicht gefunden.";
  if (message === "id_required") return "Ungültige Nachricht.";
  const lower = message.toLowerCase();
  if (
    lower.includes("cannot delete")
    || lower === "not found"
    || lower === "anfrage fehlgeschlagen."
    || lower.startsWith("<!doctype")
    || lower.startsWith("<html")
  ) {
    return "Löschen ist auf dem Server noch nicht aktiv — API-Update deployen (Route DELETE /panel/v1/messages).";
  }
  return message;
}

export async function partnerDeleteMessage(
  token: string,
  messageId: string,
): Promise<PartnerApiResult<void>> {
  const r = await partnerAuthedJson<{ ok?: boolean }>(
    token,
    `/panel/v1/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );
  if (!r.ok) {
    return { ...r, message: partnerDeleteMessageErrorHint(r.message) };
  }
  if (!r.data.ok) {
    return { ok: false, unauthorized: false, forbidden: false, message: "Nachricht konnte nicht gelöscht werden." };
  }
  return { ok: true, data: undefined };
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
        createdAt: ride.createdAt,
        pickupLabel: String(ride.pickupLabel ?? "").trim(),
        fromLat: ride.fromLat ?? null,
        fromLon: ride.fromLon ?? null,
      },
      driver: r.data.driver ?? null,
    },
  };
}
