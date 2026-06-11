/** Server-Ops-Guards (PATCH /rides/:id/status) — Nutzer-Hinweise Fahrer-App. */
export function driverRideStatusUserMessage(
  errorCode: string,
  errorBody?: unknown,
): string | undefined {
  const body =
    errorBody && typeof errorBody === "object" && !Array.isArray(errorBody)
      ? (errorBody as { message?: unknown })
      : null;
  if (typeof body?.message === "string" && body.message.trim()) {
    return body.message.trim();
  }

  const map: Record<string, string> = {
    pickup_geofence_failed:
      "Du bist noch nicht am Abholort (max. 300 m). Bitte näher heranfahren und erneut tippen.",
    driver_location_required:
      "Standort fehlt oder ist veraltet. GPS aktivieren und kurz warten, dann erneut versuchen.",
    pickup_coordinates_missing: "Abholort hat keine Koordinaten — Support informieren.",
    trip_start_requires_pickup_phase: "Bitte zuerst „Angekommen“ bestätigen, dann Fahrt beginnen.",
    trip_start_geofence_failed: "Fahrtbeginn nur in der Nähe des Abholorts möglich.",
    complete_without_trip_start: "Ohne Fahrtbeginn ist nur 0,00 € oder Storno möglich.",
    complete_trip_not_started: "Bitte Fahrt zum Ziel starten, bevor ein Preis abgerechnet wird.",
    status_transition_invalid: "Dieser Statuswechsel ist gerade nicht erlaubt.",
    no_show_wait_too_short: "Bitte noch etwas am Abholort warten, bevor No-Show gestartet wird.",
    no_show_countdown_not_started: "Bitte zuerst „Kunde nicht da“ starten.",
    no_show_countdown_active: "Der No-Show-Countdown läuft noch.",
    no_show_invalid_status: "No-Show ist in diesem Fahrtstatus nicht möglich.",
  };
  return map[errorCode];
}
