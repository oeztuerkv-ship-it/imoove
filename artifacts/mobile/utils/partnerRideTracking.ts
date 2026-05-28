/** Fahrer angekommen (API-Status: driver_waiting). */
export function isPartnerDriverArrived(status: string): boolean {
  return status === "driver_waiting";
}

export function isPartnerTrackingTerminal(status: string): boolean {
  return (
    status === "completed"
    || status === "cancelled_by_customer"
    || status === "cancelled_by_driver"
    || status === "cancelled_by_system"
    || status === "expired"
    || status === "rejected"
  );
}

export function partnerRideStatusLabel(status: string): string {
  switch (status) {
    case "pending":
    case "requested":
    case "searching_driver":
    case "offered":
    case "ready_for_dispatch":
      return "Fahrer wird gesucht";
    case "accepted":
      return "Fahrer wurde zugewiesen";
    case "scheduled":
      return "Reserviert";
    case "scheduled_assigned":
      return "Reservierung mit Fahrer";
    case "driver_arriving":
      return "Fahrer ist unterwegs";
    case "driver_waiting":
      return "Fahrer wartet an der Abholung";
    case "passenger_onboard":
    case "in_progress":
      return "Fahrt läuft";
    case "completed":
      return "Abgeschlossen";
    case "cancelled_by_customer":
      return "Storniert (Kunde)";
    case "cancelled_by_driver":
      return "Storniert (Fahrer)";
    case "cancelled_by_system":
      return "Storniert (System)";
    case "expired":
      return "Nicht vermittelt";
    case "rejected":
      return "Abgelehnt";
    default:
      return "In Bearbeitung";
  }
}
