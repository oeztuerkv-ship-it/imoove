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
    case "searching_driver":
      return "Suche Fahrer…";
    case "accepted":
      return "Fahrer zugewiesen";
    case "driver_arriving":
      return "Fahrer unterwegs";
    case "driver_waiting":
      return "Fahrer ist da";
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
    default:
      return status;
  }
}
