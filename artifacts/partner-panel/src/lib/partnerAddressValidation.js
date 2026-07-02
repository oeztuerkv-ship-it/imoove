/** Partner-Panel: Start/Ziel — Straße + Hausnummer + PLZ (5-stellig) Pflicht. */

export const PARTNER_ROUTE_ADDRESS_MESSAGE_DE =
  "Straße, Hausnummer und PLZ (5-stellig) — das reicht für die Routenberechnung.";

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

/** Einzeilige API-Adresse aus Straße, Hausnummer, PLZ. */
export function formatPartnerAddressFull(street, houseNumber, plz) {
  const s = String(street ?? "").trim();
  const n = String(houseNumber ?? "").trim();
  const p = String(plz ?? "").trim();
  if (!s && !n && !p) return "";
  const line = [s, n].filter(Boolean).join(" ").trim();
  if (!p) return line;
  return line ? `${line}, ${p}` : p;
}

export function validatePartnerAddressParts(street, houseNumber, plz, field) {
  const label = field === "from" ? "Abholung" : "Ziel";
  const s = String(street ?? "").trim();
  const n = String(houseNumber ?? "").trim();
  const p = String(plz ?? "").trim();
  if (!s) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: Straße fehlt.`,
    };
  }
  if (!n) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: Hausnummer fehlt.`,
    };
  }
  if (!/^\d{5}$/.test(p)) {
    return {
      ok: false,
      error: "partner_address_incomplete",
      field,
      message: `${label}: PLZ muss 5-stellig sein.`,
    };
  }
  return { ok: true };
}

export function validatePartnerRouteAddressParts(from, to) {
  const fromCheck = validatePartnerAddressParts(from.street, from.houseNumber, from.plz, "from");
  if (!fromCheck.ok) return fromCheck;
  return validatePartnerAddressParts(to.street, to.houseNumber, to.plz, "to");
}
