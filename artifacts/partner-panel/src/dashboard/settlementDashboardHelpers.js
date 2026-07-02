/** @typedef {"today" | "week" | "month" | "year"} SettlementUiPeriodKey */

import { isNonBillableRideStatus } from "./dashboardHelpers.js";

export function formatEur(n) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export function formatPctRate(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

export function formatShortDt(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function paymentMethodDe(pm) {
  const v = (pm ?? "").trim().toLowerCase();
  if (!v) return "—";
  if (v === "card" || v.includes("kredit") || v.includes("credit")) return "Karte";
  if (v.includes("apple")) return "Apple Pay";
  if (v.includes("google")) return "Google Pay";
  if (v === "cash" || v === "bar" || v.includes("bar")) return "Bar";
  return pm;
}

export function paymentStatusDe(s) {
  const m = {
    pending: "Offen",
    authorized: "Reserviert",
    paid: "Bezahlt",
    failed: "Fehlgeschlagen",
    refunded: "Erstattet",
  };
  return m[s] ?? s ?? "—";
}

export function statusDe(s) {
  const m = {
    draft: "Entwurf",
    scheduled: "Geplant",
    requested: "Angefragt",
    searching_driver: "Suche",
    offered: "Angebot",
    pending: "Wartet",
    accepted: "Angenommen",
    driver_arriving: "Anfahrt",
    driver_waiting: "Wartet",
    passenger_onboard: "Einsteigen",
    arrived: "Vor Ort",
    in_progress: "Fahrt",
    completed: "Fertig",
    cancelled: "Storno",
    cancelled_by_customer: "Storno Kunde",
    cancelled_by_driver: "Storno Fahrer",
    cancelled_by_system: "Storno System",
    expired: "Abgelaufen",
    rejected: "Abgelehnt",
  };
  return m[s] ?? s ?? "—";
}

/**
 * @param {SettlementUiPeriodKey} periodKey
 * @param {"rolling" | "calendar"} weekMode
 * @param {number | null | undefined} selectedYear
 */
export function settlementPeriodScopeHint(periodKey, weekMode, selectedYear) {
  switch (periodKey) {
    case "today":
      return "Tag = Kalendertag (Europe/Berlin), abgeschlossene Fahrten nach Erstellungszeitpunkt.";
    case "week":
      return weekMode === "calendar"
        ? "Woche = Kalenderwoche Mo–So (Europe/Berlin)."
        : "Woche = rollierend 7×24 Stunden ab jetzt.";
    case "month":
      return "Monat = Kalendermonat (Europe/Berlin).";
    case "year":
      return `Jahr = Kalenderjahr ${selectedYear ?? "…"} (Europe/Berlin).`;
    default:
      return "Europe/Berlin";
  }
}

/**
 * @param {SettlementUiPeriodKey} periodKey
 * @param {"rolling" | "calendar"} weekMode
 * @param {number | null | undefined} selectedYear
 */
export function billingMonthForSettlementPeriod(periodKey, weekMode, selectedYear) {
  const now = new Date();
  const berlinParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = Number(berlinParts.find((p) => p.type === "year")?.value ?? now.getFullYear());
  const m = berlinParts.find((p) => p.type === "month")?.value ?? "01";
  if (periodKey === "year") {
    const yr = selectedYear ?? y;
    return yr === y ? `${y}-${m}` : `${yr}-12`;
  }
  return `${y}-${m}`;
}

/**
 * @param {SettlementUiPeriodKey} periodKey
 * @param {"rolling" | "calendar"} weekMode
 */
export function apiPeriodForUi(periodKey, weekMode) {
  if (periodKey === "week" && weekMode === "calendar") return "weekCalendar";
  return periodKey;
}

/** URLSearchParams für settlement-rides / export-pdf. */
export function buildSettlementExportQueryParams(periodKey, weekMode, selectedYear) {
  const p = new URLSearchParams();
  p.set("period", apiPeriodForUi(periodKey, weekMode));
  if (periodKey === "week") p.set("weekMode", weekMode);
  if (periodKey === "year") p.set("year", String(selectedYear));
  return p;
}

/** Abgerechneter Endpreis oder Taxameter-Schätzung klar labeln. */
export function settlementAmountCell(ride) {
  if (ride?.status != null && isNonBillableRideStatus(ride.status)) {
    return { value: "—", label: "" };
  }
  if (ride?.hasFinancials && ride.grossAmount != null) {
    return { value: formatEur(ride.grossAmount), label: "Abgerechnet" };
  }
  const v = ride?.finalFare != null ? ride.finalFare : ride?.estimatedFare;
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: "—", label: "" };
  const kind = ride?.finalFare != null ? "Taxameter" : "Schätzung";
  return { value: formatEur(n), label: kind };
}

export function fareCellLabeled(ride) {
  if (ride?.status != null && isNonBillableRideStatus(ride.status)) {
    return { value: "—", label: "" };
  }
  const hasFin = ride?.settlementGross != null || ride?.grossAmount != null;
  if (hasFin) {
    const n = Number(ride.settlementGross ?? ride.grossAmount);
    return { value: formatEur(n), label: "Abgerechnet" };
  }
  const v = ride?.finalFare != null ? ride.finalFare : ride?.estimatedFare;
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: "—", label: "" };
  return { value: formatEur(n), label: ride?.finalFare != null ? "Taxameter" : "Schätzung" };
}
