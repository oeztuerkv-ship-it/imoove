/** Partner-Buchung: Start/Ziel brauchen Straße+Hausnummer und deutsche PLZ (wie Panel-API). */

export const PARTNER_ROUTE_ADDRESS_MESSAGE_DE =
  "Straße, Hausnummer und PLZ (5-stellig) — das reicht für die Routenberechnung.";

export type PartnerRouteAddressField = "from" | "to";

function streetHouseNumberInFirstPart(address: string): boolean {
  const firstPart = String(address ?? "")
    .split(",")[0]
    .trim();
  if (!firstPart) return false;
  return /\b\d{1,5}[a-z]?(?:\s*[-/]\s*\d{1,5}[a-z]?)?\b/i.test(firstPart);
}

function germanPlzInAddress(address: string): boolean {
  return /\b\d{5}\b/.test(String(address ?? ""));
}

export function validatePartnerRouteAddress(
  address: string,
  field: PartnerRouteAddressField,
): { ok: false; message: string } | { ok: true } {
  const full = String(address ?? "").trim();
  const label = field === "from" ? "Start" : "Ziel";
  if (!full) {
    return {
      ok: false,
      message: `${label}: Adresse fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!streetHouseNumberInFirstPart(full)) {
    return {
      ok: false,
      message: `${label}: Straße und Hausnummer fehlen. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!germanPlzInAddress(full)) {
    return {
      ok: false,
      message: `${label}: PLZ (5-stellig) fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  return { ok: true };
}

export function validatePartnerRouteAddresses(
  fromFull: string,
  toFull: string,
): { ok: false; message: string } | { ok: true } {
  const from = validatePartnerRouteAddress(fromFull, "from");
  if (!from.ok) return from;
  return validatePartnerRouteAddress(toFull, "to");
}

export function shortPartnerAddressLabel(full: string): string {
  const first = String(full ?? "").split(",")[0]?.trim();
  return first || "—";
}
