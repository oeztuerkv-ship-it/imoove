import * as Location from "expo-location";

import { fetchFareEstimate } from "@/utils/fareEstimateApi";
import { partnerCreateRide } from "@/utils/partnerApi";
import type { PartnerMeUser } from "@/utils/partnerMobileAccess";

const OPEN_DEST_SHORT = "Ziel nach Absprache";
const OPEN_DEST_FULL = "Ziel nach Absprache (Partner)";
const MIN_DISTANCE_KM = 1;
const MIN_DURATION_MIN = 4;

export type PartnerPickupPlace = {
  label: string;
  full: string;
  lat: number;
  lon: number;
};

export type PartnerPickupResult =
  | { ok: true; place: PartnerPickupPlace }
  | { ok: false; code: "permission_denied" | "location_unavailable"; message: string };

function formatReverseGeocode(row: Location.LocationGeocodedAddress): string {
  const parts = [row.street, row.streetNumber, row.postalCode, row.city].filter(Boolean);
  return parts.join(" ").trim() || row.name || row.district || "Standort";
}

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
    let full = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    let label = "Aktueller Standort";

    try {
      const rows = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (rows[0]) {
        full = formatReverseGeocode(rows[0]);
        label = rows[0].street
          ? `${rows[0].street}${rows[0].streetNumber ? ` ${rows[0].streetNumber}` : ""}`
          : full;
      }
    } catch {
      /* Koordinaten reichen als Fallback */
    }

    return { ok: true, place: { label: label.trim() || full, full, lat, lon } };
  } catch {
    return {
      ok: false,
      code: "location_unavailable",
      message: "GPS-Standort konnte nicht ermittelt werden. Bitte kurz warten und erneut versuchen.",
    };
  }
}

function openDestinationCoords(fromLat: number, fromLon: number): { toLat: number; toLon: number } {
  return { toLat: fromLat + 0.007, toLon: fromLon };
}

export async function createPartnerInstantTaxiRide(
  token: string,
  user: PartnerMeUser,
  pickup: PartnerPickupPlace,
): Promise<{ ok: true; rideId: string } | { ok: false; message: string; unauthorized?: boolean }> {
  const { toLat, toLon } = openDestinationCoords(pickup.lat, pickup.lon);
  const fare = await fetchFareEstimate("standard", {
    distanceKm: MIN_DISTANCE_KM,
    tripMinutes: MIN_DURATION_MIN,
    fromFull: pickup.full,
    fromLat: pickup.lat,
    fromLon: pickup.lon,
    toFull: OPEN_DEST_FULL,
  });
  const estimatedFare = fare?.total ?? 0;
  if (!Number.isFinite(estimatedFare) || estimatedFare <= 0) {
    return { ok: false, message: "Tarif konnte nicht berechnet werden." };
  }

  const customerName = (user.companyName?.trim() || user.username?.trim() || "Partner").slice(0, 120);
  const body = {
    customerName,
    from: pickup.label,
    fromFull: pickup.full,
    to: OPEN_DEST_SHORT,
    toFull: OPEN_DEST_FULL,
    fromLat: pickup.lat,
    fromLon: pickup.lon,
    toLat,
    toLon,
    distanceKm: MIN_DISTANCE_KM,
    durationMinutes: MIN_DURATION_MIN,
    estimatedFare,
    paymentMethod: "Barzahlung",
    vehicle: "standard",
    rideKind: "standard",
    payerKind: "company",
  };

  const created = await partnerCreateRide(token, body);
  if (!created.ok) {
    return {
      ok: false,
      message: created.message,
      ...(created.unauthorized ? { unauthorized: true } : {}),
    };
  }
  return { ok: true, rideId: created.ride.id };
}
