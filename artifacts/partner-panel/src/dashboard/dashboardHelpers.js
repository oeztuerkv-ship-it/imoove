/** @param {unknown} status */
export function isTerminalRideStatus(status) {
  const s = String(status ?? "").trim();
  const terminal = new Set([
    "completed",
    "cancelled",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "expired",
    "rejected",
  ]);
  return terminal.has(s);
}

export function berlinTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** @param {string | undefined | null} iso */
export function isoToBerlinYmd(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Fahrten mit geplantem Termin heute (Europe/Berlin).
 * @param {Record<string, unknown>[]} rides
 */
export function ridesScheduledTodayBerlin(rides) {
  const today = berlinTodayYmd();
  return rides.filter((r) => {
    const ymd = isoToBerlinYmd(typeof r.scheduledAt === "string" ? r.scheduledAt : null);
    return ymd === today;
  });
}

/**
 * @param {Record<string, unknown>[]} rides
 */
export function openRidesList(rides) {
  return rides.filter((r) => !isTerminalRideStatus(r.status));
}

/**
 * @param {Record<string, unknown>[]} rides
 */
export function busyAssignedDriverCount(rides) {
  const ids = new Set();
  for (const r of rides) {
    if (isTerminalRideStatus(r.status)) continue;
    const id = r.driverId;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  return ids.size;
}

/** @param {unknown} ride */
export function getPartnerMeta(ride) {
  const m = ride?.partnerBookingMeta;
  return m && typeof m === "object" ? m : {};
}

export function medicalRides(rides) {
  return rides.filter((r) => {
    const m = getPartnerMeta(r);
    return m.medical_ride === true || r.rideKind === "medical";
  });
}

/**
 * @param {Record<string, unknown>[]} rides
 */
/** Krankenfahrten ohne abgeschlossene Abrechnung (vereinfacht). */
export function medicalOpenOperationsCount(rides) {
  return medicalRides(rides).filter((r) => {
    const m = getPartnerMeta(r);
    const inv = String(m.invoice_status ?? "").toLowerCase();
    return inv !== "paid" && inv !== "cancelled" && inv !== "storniert";
  }).length;
}

export function deriveMedicalOperationsStats(rides) {
  const med = medicalRides(rides);
  let muster4Open = 0;
  let waitingBilling = 0;
  let invoicesInReview = 0;

  for (const r of med) {
    const m = getPartnerMeta(r);
    if (m.signature_done !== true) muster4Open += 1;
    const ready = m.billing_ready === true || m.billingStatus?.ready === true;
    if (!ready) waitingBilling += 1;
    const inv = String(m.invoice_status ?? "").toLowerCase();
    if (inv === "sent" || inv === "created") invoicesInReview += 1;
  }

  return { medicalTotal: med.length, muster4Open, waitingBilling, invoicesInReview };
}

export function moneyDe(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function rideStatusLabelDe(status) {
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    completed: "Abgeschlossen",
  };
  return m[String(status)] ?? String(status ?? "—");
}
