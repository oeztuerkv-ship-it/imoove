/** Partner-Panel: Start/Ziel — Straße + Hausnummer + PLZ (5-stellig) Pflicht. */

export const PARTNER_ROUTE_ADDRESS_MESSAGE_DE =
  "Bitte Straße mit Hausnummer und PLZ angeben (z. B. Musterstraße 12, 70771 Leinfelden-Echterdingen).";

function streetHouseNumberInFirstPart(address) {
  const firstPart = String(address ?? "")
    .split(",")[0]
    .trim();
  if (!firstPart) return false;
  return /\b\d{1,5}[a-z]?(?:\s*[-/]\s*\d{1,5}[a-z]?)?\b/i.test(firstPart);
}

function germanPlzInAddress(address) {
  return /\b\d{5}\b/.test(String(address ?? ""));
}

export function validatePartnerRouteAddress(address, field) {
  const full = String(address ?? "").trim();
  const label = field === "from" ? "Start" : "Ziel";
  if (!full) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: Adresse fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!streetHouseNumberInFirstPart(full)) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: Straße und Hausnummer fehlen. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!germanPlzInAddress(full)) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: PLZ (5-stellig) fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  return { ok: true };
}

export function validatePartnerRouteAddresses(fromFull, toFull) {
  const from = validatePartnerRouteAddress(fromFull, "from");
  if (!from.ok) return from;
  return validatePartnerRouteAddress(toFull, "to");
}
