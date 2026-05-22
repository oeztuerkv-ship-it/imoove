import { AppState } from "react-native";

/** Push-/Alarm-Routing: Fahrer-Angebote nicht im Kunden-UI (nur Fahrer-Route oder App im Hintergrund mit Fahrer-Session). */
let driverSurfaceActive = false;
let fleetSessionActive = false;

export function setNotificationAudience(opts: {
  driverSurface: boolean;
  fleetSession: boolean;
}): void {
  driverSurfaceActive = opts.driverSurface;
  fleetSessionActive = opts.fleetSession;
}

const DRIVER_PUSH_KINDS = new Set([
  "instant_ride_offer",
  "reservation_activate_reminder",
  "reservation_missed_activation",
]);

export function isDriverPushKind(kind: unknown): boolean {
  return typeof kind === "string" && DRIVER_PUSH_KINDS.has(kind);
}

/** Foreground-Banner/Sound/Push-Anzeige für Fahrer-Fahrtanfragen. */
export function shouldPresentDriverRideOfferNotification(): boolean {
  if (driverSurfaceActive) return true;
  if (!fleetSessionActive) return false;
  return AppState.currentState !== "active";
}

/** Expo foreground handler: Kunde sieht keine Fahrer-Markt-Pushes. */
export function shouldShowExpoNotification(data: { kind?: unknown } | undefined): boolean {
  const driverKind = isDriverPushKind(data?.kind);
  if (driverKind) return shouldPresentDriverRideOfferNotification();
  return !driverSurfaceActive;
}
