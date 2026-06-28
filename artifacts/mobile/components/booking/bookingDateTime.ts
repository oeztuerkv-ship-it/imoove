import { RESERVATION_LEAD_MS } from "@/components/ReservationSchedulePicker";

export function padBookingTime(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatBookingDateTime(d: Date) {
  const datePart = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  return `${datePart}, ${padBookingTime(d.getHours())}:${padBookingTime(d.getMinutes())} Uhr`;
}

/** Default für Festpreis / Reservieren (≥ 60 Min Vorlauf, 5-Min-Raster). */
export function defaultScheduledPickupDate(nowMs = Date.now()): Date {
  const d = new Date(nowMs + 75 * 60 * 1000);
  d.setSeconds(0, 0);
  const roundedMin = Math.ceil(d.getMinutes() / 5) * 5;
  if (roundedMin >= 60) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(roundedMin, 0, 0);
  }
  return d;
}

export function minimumScheduledPickupDate(nowMs = Date.now()): Date {
  return new Date(nowMs + RESERVATION_LEAD_MS);
}
