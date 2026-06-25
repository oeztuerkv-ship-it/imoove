/** Partner-Panel: Start/Ziel müssen Straße+Hausnummer und deutsche PLZ enthalten. */

export const PARTNER_ROUTE_ADDRESS_MESSAGE_DE =
  "Bitte Straße mit Hausnummer und PLZ angeben (z. B. Musterstraße 12, 70771 Leinfelden-Echterdingen).";

export type PartnerRouteAddressField = "from" | "to";

export type PartnerRouteAddressError = {
  error: "partner_address_incomplete";
  message: string;
  field?: PartnerRouteAddressField;
};

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
): PartnerRouteAddressError | null {
  const full = String(address ?? "").trim();
  const label = field === "from" ? "Start" : "Ziel";
  if (!full) {
    return {
      error: "partner_address_incomplete",
      field,
      message: `${label}: Adresse fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!streetHouseNumberInFirstPart(full)) {
    return {
      error: "partner_address_incomplete",
      field,
      message: `${label}: Straße und Hausnummer fehlen. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  if (!germanPlzInAddress(full)) {
    return {
      error: "partner_address_incomplete",
      field,
      message: `${label}: PLZ (5-stellig) fehlt. ${PARTNER_ROUTE_ADDRESS_MESSAGE_DE}`,
    };
  }
  return null;
}

export function validatePartnerRouteAddressPair(
  fromFull: string,
  toFull: string,
): PartnerRouteAddressError | null {
  return validatePartnerRouteAddress(fromFull, "from") ?? validatePartnerRouteAddress(toFull, "to");
}
