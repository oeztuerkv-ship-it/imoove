/** Push-/Alarm-Routing: Fahrer-Angebote nur auf /driver/*; Kunde keine Markt-Pushes in der App. */
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
  "follow_up_offer",
  "reservation_activate_reminder",
  "reservation_missed_activation",
  "ride_cancelled_by_customer",
]);

export function isDriverPushKind(kind: unknown): boolean {
  return typeof kind === "string" && DRIVER_PUSH_KINDS.has(kind);
}

/** Foreground-Banner/Sound/Push-Anzeige für Fahrer-Fahrtanfragen (nur auf /driver/*). */
export function shouldPresentDriverRideOfferNotification(): boolean {
  if (!driverSurfaceActive) return false;
  if (!fleetSessionActive) return false;
  return true;
}

/** Expo foreground handler: Fahrer-Markt nur auf Fahrer-Oberfläche; Kunde nur Kunden-Pushes. */
export function shouldShowExpoNotification(data: { kind?: unknown } | undefined): boolean {
  const driverKind = isDriverPushKind(data?.kind);
  if (driverKind) return shouldPresentDriverRideOfferNotification();
  return !driverSurfaceActive;
}
