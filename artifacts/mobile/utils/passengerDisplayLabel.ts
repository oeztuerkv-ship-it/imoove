/** Fahrgast + optional Partner-Mandant (Panel-Buchung, z. B. „Laufkunde · Hotel XY“). */
export function passengerWithPartnerLabel(
  customerName: string | null | undefined,
  bookingPartnerName?: string | null,
): string {
  const name = String(customerName ?? "").trim() || "Kunde";
  const partner = String(bookingPartnerName ?? "").trim();
  if (partner) return `${name} · ${partner}`;
  return name;
}

export function passengerLabelInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const firstSegment = trimmed.split("·")[0]?.trim() || trimmed;
  return firstSegment.charAt(0).toUpperCase();
}
