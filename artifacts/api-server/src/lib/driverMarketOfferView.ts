import type { RideRequest } from "../domain/rideRequest.js";
import { stripPartnerOnlyRideFields, toDriverRideView } from "../domain/ridePublic.js";
import { isInstantDispatchRideStatus } from "../db/rideDispatchOfferData.js";
import { normalizeDispatchPriority, type DispatchPriority } from "./dispatchPriorityTier.js";
import { estimatePickupEtaMinutes } from "./ridePickupEta.js";
import { haversineDistanceKm } from "./serviceRegionMatch.js";

function computePickupReach(
  r: RideRequest,
  driverLat: number | null,
  driverLon: number | null,
): { pickupReachKm: number | null; pickupReachMinutes: number | null } {
  if (
    driverLat != null &&
    driverLon != null &&
    r.fromLat != null &&
    r.fromLon != null
  ) {
    const pickupReachKm =
      Math.round(haversineDistanceKm(driverLat, driverLon, r.fromLat, r.fromLon) * 10) / 10;
    const pickupReachMinutes = estimatePickupEtaMinutes(
      driverLat,
      driverLon,
      r.fromLat,
      r.fromLon,
    );
    return { pickupReachKm, pickupReachMinutes };
  }
  return { pickupReachKm: null, pickupReachMinutes: null };
}

function redactedOpenOfferView(
  r: RideRequest,
  opts: { driverLat: number | null; driverLon: number | null },
): RideRequest {
  const base = toDriverRideView(r);
  const { pickupReachKm, pickupReachMinutes } = computePickupReach(r, opts.driverLat, opts.driverLon);
  return {
    ...base,
    from: "",
    fromFull: "",
    fromLat: undefined,
    fromLon: undefined,
    to: "",
    toFull: "",
    toLat: undefined,
    toLon: undefined,
    distanceKm: 0,
    durationMinutes: 0,
    customerPhone: null,
    pickupReachKm,
    pickupReachMinutes,
  } as RideRequest;
}

function premiumOpenOfferView(
  r: RideRequest,
  opts: { driverLat: number | null; driverLon: number | null },
): RideRequest {
  const base = stripPartnerOnlyRideFields(r);
  const { pickupReachKm, pickupReachMinutes } = computePickupReach(r, opts.driverLat, opts.driverLon);
  return {
    ...base,
    from: r.from,
    fromFull: r.fromFull,
    fromLat: r.fromLat,
    fromLon: r.fromLon,
    to: r.to,
    toFull: r.toFull,
    toLat: r.toLat,
    toLon: r.toLon,
    distanceKm: r.distanceKm,
    durationMinutes: r.durationMinutes,
    estimatedFare: r.estimatedFare,
    pickupReachKm,
    pickupReachMinutes,
  } as RideRequest;
}

/** Offenes Sofortangebot: Prio A sieht Route/Entfernung/Preis; B/C nur Anfahrt km/Min. */
export function toDriverOpenMarketOfferView(
  r: RideRequest,
  opts: {
    driverLat: number | null;
    driverLon: number | null;
    driverDispatchPriority?: DispatchPriority | string | null;
  },
): RideRequest {
  if (r.driverId || !isInstantDispatchRideStatus(r.status)) {
    return toDriverRideView(r);
  }

  const priority = normalizeDispatchPriority(opts.driverDispatchPriority ?? "C");
  if (priority === "A") {
    return premiumOpenOfferView(r, opts);
  }
  return redactedOpenOfferView(r, opts);
}

/** Offene Reservierung: Prio A sieht volle Adressen; B/C reduziert (wie Sofortangebot). */
export function toDriverOpenReservationView(
  r: RideRequest,
  opts: {
    driverDispatchPriority?: DispatchPriority | string | null;
  },
): RideRequest {
  if (r.status !== "scheduled" || r.driverId) {
    return stripPartnerOnlyRideFields(toDriverRideView(r));
  }

  const priority = normalizeDispatchPriority(opts.driverDispatchPriority ?? "C");
  if (priority === "A") {
    return stripPartnerOnlyRideFields(r);
  }
  return redactedOpenOfferView(r, { driverLat: null, driverLon: null });
}

/** Grober Ort für B/C (kein Straßen-Detail) — letzte Adresszeile / Stadtteil. */
export function coarseAreaFromRideAddress(r: Pick<RideRequest, "fromFull" | "from">): string {
  const raw = String(r.fromFull || r.from || "").trim();
  if (!raw) return "Umgebung";
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    return last.replace(/\b\d{5}\b/g, "").trim() || last;
  }
  const noHouse = parts[0]!.replace(/\b\d{1,5}[a-z]?\b/gi, "").replace(/\s+/g, " ").trim();
  return noHouse || "Umgebung";
}

/**
 * Verpasste Fahrt in „Meine Fahrten“: immer nach aktueller Fahrer-Prio redigieren
 * (auch wenn die Fahrt schon einen anderen Fahrer hat / abgeschlossen ist).
 * Tier A: Start/Ziel; B/C: nur grober Ort + Zeiten (keine Strecken-Details).
 */
export function toDriverMissedRideView(
  r: RideRequest,
  opts: {
    driverDispatchPriority?: DispatchPriority | string | null;
  },
): RideRequest & { routeVisible: boolean; approxArea: string } {
  const priority = normalizeDispatchPriority(opts.driverDispatchPriority ?? "C");
  const approxArea = coarseAreaFromRideAddress(r);
  if (priority === "A") {
    const full = stripPartnerOnlyRideFields(r);
    return { ...full, routeVisible: true, approxArea };
  }
  const redacted = redactedOpenOfferView(r, { driverLat: null, driverLon: null });
  return {
    ...redacted,
    from: approxArea,
    fromFull: approxArea,
    routeVisible: false,
    approxArea,
  };
}
