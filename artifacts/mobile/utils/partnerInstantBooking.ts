import * as Location from "expo-location";

import { getApiBaseUrl, fetchErrorMessage } from "@/utils/apiBase";
import { partnerCreateRide } from "@/utils/partnerApi";
import type { PartnerMeUser } from "@/utils/partnerMobileAccess";
import { validatePartnerRouteAddresses } from "@/utils/partnerRouteAddress";
import {
  geoLocationToPartnerRoutePlace,
  type PartnerRoutePlace,
} from "@/utils/partnerRoutePlace";
import { RESERVATION_LEAD_MS } from "@/utils/partnerScheduling";
import { reverseGeocodeCoords } from "@/utils/reverseGeocode";

export type { PartnerRoutePlace };

export type PartnerPickupPlace = PartnerRoutePlace;

export type PartnerPickupResult =
  | { ok: true; place: PartnerRoutePlace }
  | { ok: false; code: "permission_denied" | "location_unavailable"; message: string };

export type PartnerBookMode = "now" | "reservation";

export type PartnerBookParams = {
  mode: PartnerBookMode;
  note?: string;
  scheduledAt?: string | null;
};

export type PartnerRouteQuote = {
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
};

export async function resolvePartnerPickupFromGps(): Promise<PartnerPickupResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    return {
      ok: false,
      code: "permission_denied",
      message: "Standortzugriff ist erforderlich. Bitte in den Geräteeinstellungen erlauben.",
    };
  }

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const geo = await reverseGeocodeCoords(lat, lon);
    const place = geoLocationToPartnerRoutePlace(geo);
    return { ok: true, place };
  } catch {
    return {
      ok: false,
      code: "location_unavailable",
      message: "GPS-Standort konnte nicht ermittelt werden. Bitte kurz warten und erneut versuchen.",
    };
  }
}

export function defaultPartnerReservationTime(): Date {
  const d = new Date(Date.now() + RESERVATION_LEAD_MS + 30 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

export async function fetchPartnerRouteQuote(
  token: string,
  from: PartnerRoutePlace,
  to: PartnerRoutePlace,
): Promise<
  | { ok: true; quote: PartnerRouteQuote }
  | { ok: false; message: string; unauthorized?: boolean }
> {
  const addrCheck = validatePartnerRouteAddresses(from.full, to.full);
  if (!addrCheck.ok) {
    return { ok: false, message: addrCheck.message };
  }

  const base = getApiBaseUrl();
  if (!base) return { ok: false, message: "API-URL fehlt." };

  const res = await fetch(`${base}/panel/v1/route-distance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fromFull: from.full,
      toFull: to.full,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
      vehicle: "standard",
    }),
  });

  if (res.status === 401) {
    return { ok: false, unauthorized: true, message: "Sitzung abgelaufen." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    distanceKm?: number;
    durationMinutes?: number;
    estimatedFare?: number;
    from?: { lat?: number; lon?: number };
    to?: { lat?: number; lon?: number };
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.ok) {
    const msg =
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : data.error === "service_area_not_covered"
          ? "Adresse liegt außerhalb des Servicegebietes."
          : data.error === "from_not_found"
            ? "Startadresse konnte nicht gefunden werden."
            : data.error === "to_not_found"
              ? "Zieladresse konnte nicht gefunden werden."
              : typeof data.error === "string"
                ? data.error
                : await fetchErrorMessage(res, "Route konnte nicht berechnet werden.");
    return { ok: false, message: msg };
  }

  const distanceKm = Number(data.distanceKm);
  const durationMinutes = Number(data.durationMinutes);
  const estimatedFare = Number(data.estimatedFare);
  const fromLat = Number(data.from?.lat ?? from.lat);
  const fromLon = Number(data.from?.lon ?? from.lon);
  const toLat = Number(data.to?.lat ?? to.lat);
  const toLon = Number(data.to?.lon ?? to.lon);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, message: "Keine Route zwischen Start und Ziel gefunden." };
  }
  if (!Number.isFinite(estimatedFare) || estimatedFare <= 0) {
    return { ok: false, message: "Tarif konnte nicht berechnet werden." };
  }

  return {
    ok: true,
    quote: {
      distanceKm,
      durationMinutes: Number.isFinite(durationMinutes) ? Math.max(1, durationMinutes) : 1,
      estimatedFare,
      fromLat,
      fromLon,
      toLat,
      toLon,
    },
  };
}

export async function createPartnerTaxiRide(
  token: string,
  user: PartnerMeUser,
  from: PartnerRoutePlace,
  to: PartnerRoutePlace,
  params: PartnerBookParams,
): Promise<
  | { ok: true; rideId: string }
  | { ok: false; message: string; unauthorized?: boolean; limitReached?: boolean }
> {
  if (params.mode === "reservation") {
    const at = params.scheduledAt ? Date.parse(params.scheduledAt) : NaN;
    if (!Number.isFinite(at) || at < Date.now() + RESERVATION_LEAD_MS) {
      return {
        ok: false,
        message: "Reservierung mindestens 60 Minuten im Voraus wählen.",
      };
    }
  }

  const quoteResult = await fetchPartnerRouteQuote(token, from, to);
  if (!quoteResult.ok) {
    return {
      ok: false,
      message: quoteResult.message,
      ...(quoteResult.unauthorized ? { unauthorized: true } : {}),
    };
  }
  const quote = quoteResult.quote;

  const customerName = (user.companyName?.trim() || user.username?.trim() || "Partner").slice(0, 120);
  const note = params.note?.trim().slice(0, 200);
  const body: Record<string, unknown> = {
    customerName,
    from: from.label,
    fromFull: from.full,
    to: to.label,
    toFull: to.full,
    fromLat: quote.fromLat,
    fromLon: quote.fromLon,
    toLat: quote.toLat,
    toLon: quote.toLon,
    distanceKm: quote.distanceKm,
    durationMinutes: quote.durationMinutes,
    estimatedFare: quote.estimatedFare,
    paymentMethod: "Barzahlung",
    vehicle: "standard",
    rideKind: "standard",
    payerKind: "passenger",
    ...(params.mode === "reservation" && params.scheduledAt ? { scheduledAt: params.scheduledAt } : {}),
    ...(note ? { driverNote: note } : {}),
  };

  const created = await partnerCreateRide(token, body);
  if (!created.ok) {
    return {
      ok: false,
      message: created.message,
      ...(created.unauthorized ? { unauthorized: true } : {}),
      ...(created.limitReached ? { limitReached: true } : {}),
    };
  }
  return { ok: true, rideId: created.ride.id };
}
