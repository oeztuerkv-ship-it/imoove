/** Ergebnis der Fahrt, wenn ein Zugangscode eingelöst wurde (für Verlauf / Export). */
export type AccessCodeTripOutcome = "no_code" | "open" | "completed" | "cancelled" | "rejected";

/** Zustand der Code-Definition zum Abfragezeitpunkt (unabhängig von einzelner Fahrt). */
export type AccessCodeDefinitionState =
  | "valid"
  | "inactive"
  | "not_yet_valid"
  | "expired_window"
  | "exhausted";

export function accessCodeTripOutcomeFromRide(r: {
  authorizationSource: string;
  status: string;
}): AccessCodeTripOutcome {
  if (r.authorizationSource !== "access_code") return "no_code";
  switch (r.status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "rejected";
    default:
      return "open";
  }
}

export function computeAccessCodeDefinitionState(
  row: {
    is_active: boolean;
    valid_from: Date | null;
    valid_until: Date | null;
    max_uses: number | null;
    uses_count: number;
  },
  now: Date,
): AccessCodeDefinitionState {
  if (!row.is_active) return "inactive";
  if (row.valid_from && row.valid_from > now) return "not_yet_valid";
  if (row.valid_until && row.valid_until < now) return "expired_window";
  if (row.max_uses != null && row.uses_count >= row.max_uses) return "exhausted";
  return "valid";
}
