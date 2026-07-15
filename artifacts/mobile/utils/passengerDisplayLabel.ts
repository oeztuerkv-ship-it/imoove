/** Fahrgast + optional Partner-Mandant (Panel-Buchung, z. B. „Laufkunde · Hotel XY“). */
export function passengerWithPartnerLabel(
  customerName: string | null | undefined,
  bookingPartnerName?: string | null,
): string {
  const { partnerName, passengerName } = driverScheduledPassengerLines(customerName, bookingPartnerName);
  if (partnerName && passengerName) return `${passengerName} · ${partnerName}`;
  if (partnerName) return partnerName;
  return passengerName ?? "Kunde";
}

function displayNamesMatch(a: string, b: string): boolean {
  return a.localeCompare(b, "de", { sensitivity: "accent" }) === 0;
}

/**
 * Fahrer Reservierung: Partner-Firma getrennt vom Fahrgast.
 * Bei Panel-/Partner-Buchung ist `customerName` oft identisch mit dem Mandantennamen → nur einmal anzeigen.
 */
export function driverScheduledPassengerLines(
  customerName: string | null | undefined,
  bookingPartnerName?: string | null,
): { partnerName: string | null; passengerName: string | null } {
  const partner = String(bookingPartnerName ?? "").trim() || null;
  const rawCustomer = String(customerName ?? "").trim();
  const customer = rawCustomer || "Kunde";

  if (!partner) {
    return { partnerName: null, passengerName: customer };
  }

  if (
    displayNamesMatch(customer, partner) ||
    customer === "Kunde" ||
    customer === "Partner"
  ) {
    return { partnerName: partner, passengerName: null };
  }

  return { partnerName: partner, passengerName: customer };
}

export function passengerLabelInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const firstSegment = trimmed.split("·")[0]?.trim() || trimmed;
  return firstSegment.charAt(0).toUpperCase();
}
