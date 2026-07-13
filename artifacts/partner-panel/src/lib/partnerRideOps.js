import { getPartnerMeta } from "../pages/finance/financeHelpers.js";

/** @typedef {"passenger" | "company"} PartnerPayerMode */

export const SEARCH_POOL_STATUSES = new Set([
  "pending",
  "requested",
  "searching_driver",
  "offered",
  "ready_for_dispatch",
]);

export const LIVE_DRIVER_STATUSES = new Set([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

export const TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "rejected",
  "no_driver",
  "expired",
]);

/** Preis auf Karten/Homepage erst nach abgeschlossener Fahrt (keine Schätzung bei Anfrage/Disposition). */
export function partnerRideShowsFare(ride) {
  return String(ride?.status ?? "") === "completed";
}

/** @param {PartnerPayerMode} mode */
export function paymentMethodForPayerMode(mode) {
  return mode === "company" ? "rechnung" : "Barzahlung";
}

/** @param {string | undefined | null} payerKind */
export function payerModeFromKind(payerKind) {
  const pk = String(payerKind ?? "").trim();
  if (pk === "company" || pk === "insurance") return "company";
  return "passenger";
}

export function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Ihr Unternehmen",
    insurance: "Kostenträger",
    voucher: "Gutschein",
    third_party: "Dritter",
  };
  return m[k] ?? k ?? "—";
}

export function rideKindLabel(k) {
  const m = { standard: "Normal", medical: "Krankenfahrt", voucher: "Gutschein", company: "Firmenfahrt" };
  return m[k] ?? k ?? "—";
}

export function statusLabel(status) {
  const m = {
    pending: "Wartet auf Disposition",
    requested: "Angefragt",
    searching_driver: "Fahrersuche aktiv",
    offered: "An Fahrer angeboten",
    scheduled: "Reservierung geplant",
    scheduled_assigned: "Reservierung (Fahrer)",
    ready_for_dispatch: "Bereit zur Vergabe",
    accepted: "Fahrer angenommen",
    driver_arriving: "Fahrer unterwegs",
    driver_waiting: "Fahrer wartet",
    passenger_onboard: "Fahrgast an Bord",
    arrived: "Vor Ort",
    in_progress: "Fahrt läuft",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    cancelled_by_customer: "Storniert (Kunde)",
    cancelled_by_driver: "Storniert (Fahrer)",
    cancelled_by_system: "Storniert (System)",
    completed: "Abgeschlossen",
    no_driver: "Kein Fahrer",
    expired: "Abgelaufen",
  };
  return m[status] ?? status ?? "—";
}

export function statusTone(status) {
  if (status === "completed") return "ok";
  if (String(status ?? "").startsWith("cancelled") || status === "rejected" || status === "no_driver") return "err";
  if (status === "scheduled" || status === "scheduled_assigned") return "scheduled";
  if (LIVE_DRIVER_STATUSES.has(status)) return "live";
  if (status === "searching_driver") return "search";
  return "pending";
}

/** @param {Record<string, unknown> | null | undefined} ride */
export function rejectionCount(ride) {
  const rej = ride?.rejectedBy;
  return Array.isArray(rej) ? rej.filter(Boolean).length : 0;
}

/**
 * Dispositions-Schritte für UI (Sucht / Annahme / Fahrt).
 * @param {Record<string, unknown> | null | undefined} ride
 */
export function dispatchSteps(ride) {
  if (!ride) return [];
  const status = String(ride.status ?? "");
  const driverId = String(ride.driverId ?? "").trim();
  const rej = rejectionCount(ride);
  const scheduled = status === "scheduled" || status === "scheduled_assigned";

  if (TERMINAL_STATUSES.has(status)) {
    return [
      {
        key: "done",
        label: statusLabel(status),
        state: status === "completed" ? "done" : "err",
        detail: status === "completed" ? "Fahrt beendet" : "Keine aktive Disposition",
      },
    ];
  }

  if (scheduled && !driverId) {
    return [
      { key: "booked", label: "Reservierung", state: "done", detail: "Termin gespeichert" },
      { key: "dispatch", label: "Fahrer", state: "wait", detail: "Zu Termin — noch kein Fahrer" },
    ];
  }

  const steps = [
    {
      key: "booked",
      label: "Gebucht",
      state: "done",
      detail: scheduled ? "Reservierung angelegt" : "Auftrag im System",
    },
    {
      key: "search",
      label: "Fahrersuche",
      state: driverId ? "done" : status === "searching_driver" ? "active" : SEARCH_POOL_STATUSES.has(status) ? "wait" : "wait",
      detail:
        status === "searching_driver"
          ? "Online-Fahrer werden benachrichtigt"
          : rej > 0
            ? `${rej} Ablehnung${rej > 1 ? "en" : ""} — Suche läuft weiter`
            : "Wartet auf Annahme im Markt",
    },
    {
      key: "accepted",
      label: "Annahme",
      state: driverId || LIVE_DRIVER_STATUSES.has(status) ? "done" : "wait",
      detail: driverId ? "Fahrer zugewiesen" : "Noch nicht angenommen",
    },
    {
      key: "ride",
      label: "Fahrt",
      state: LIVE_DRIVER_STATUSES.has(status) ? "active" : driverId ? "wait" : "wait",
      detail: LIVE_DRIVER_STATUSES.has(status) ? statusLabel(status) : "Start nach Annahme",
    },
  ];
  return steps;
}

/** @param {Record<string, unknown> | null | undefined} ride */
export function dispatchHeadline(ride) {
  if (!ride) return "—";
  const status = String(ride.status ?? "");
  if (ride.driverId) {
    if (LIVE_DRIVER_STATUSES.has(status)) return statusLabel(status);
    return "Fahrer angenommen";
  }
  if (status === "searching_driver") return "Fahrersuche aktiv";
  if (status === "scheduled" || status === "scheduled_assigned") return "Reservierung — Fahrer offen";
  const rej = rejectionCount(ride);
  if (rej > 0) return `${rej} Ablehnung${rej > 1 ? "en" : ""} · Suche läuft`;
  if (SEARCH_POOL_STATUSES.has(status)) return "Wartet auf Fahrer-Annahme";
  return statusLabel(status);
}

/**
 * Abrechnungs-Hinweis je Zahler & Status.
 * @param {Record<string, unknown> | null | undefined} ride
 */
export function billingSummary(ride) {
  if (!ride) return { headline: "—", detail: "", tone: "muted" };
  const ci = ride.companyInvoice && typeof ride.companyInvoice === "object" ? ride.companyInvoice : null;
  if (ci?.invoiceId) {
    return {
      headline: "Rechnung erstellt",
      detail: ci.invoiceNumber ? `Nr. ${ci.invoiceNumber}` : "PDF in Abrechnung",
      tone: "ok",
      invoiceId: ci.invoiceId,
      canCreateInvoice: false,
    };
  }
  if (ci?.eligible === true) {
    return {
      headline: "Rechnungsbereit",
      detail: "Einzelfahrt-Rechnung kann erstellt werden",
      tone: "company",
      canCreateInvoice: true,
    };
  }
  const pk = String(ride.payerKind ?? "passenger");
  const pm = String(ride.paymentMethod ?? "").trim();
  const ref = String(ride.billingReference ?? "").trim();
  const meta = getPartnerMeta(ride);
  const isMedical = meta?.medical_ride === true || ride.rideKind === "medical";
  const completed = ride.status === "completed";

  if (pk === "passenger") {
    return {
      headline: "Fahrgast zahlt",
      detail: pm || "Barzahlung beim Fahrer",
      tone: "passenger",
      canCreateInvoice: false,
    };
  }

  if (pk === "insurance") {
    return {
      headline: "Kostenträger / Rechnung",
      detail: ref ? `Ref. ${ref}` : "Referenz für Abrechnung empfohlen",
      tone: "company",
    };
  }

  if (isMedical && completed) {
    const inv = String(meta?.invoice_status ?? "").trim();
    if (inv === "paid") {
      return { headline: "Rechnung bezahlt", detail: meta?.invoice_number ? `Nr. ${meta.invoice_number}` : "", tone: "ok" };
    }
    if (inv === "created" || inv === "sent") {
      return {
        headline: "Rechnung erstellt",
        detail: meta?.invoice_number ? `Nr. ${meta.invoice_number}` : "PDF im Krankenfahrten-Bereich",
        tone: "ok",
      };
    }
    if (meta?.billing_ready === true) {
      return { headline: "Abrechnungsbereit", detail: "Rechnung kann erstellt werden (Krankenfahrt)", tone: "company" };
    }
    return { headline: "Rechnung an Kostenträger", detail: "Unterlagen / Freigabe prüfen", tone: "company" };
  }

  if (completed) {
    if (pk === "company" && ci && !ci.eligible && !ci.invoiceId) {
      const blockerHint =
        Array.isArray(ci.blockers) && ci.blockers.length > 0
          ? companyInvoiceBlockerLabel(ci.blockers[0])
          : "Noch nicht rechnungsbereit";
      return {
        headline: "Rechnung an Ihr Unternehmen",
        detail: ref ? `Ref. ${ref} · ${blockerHint}` : blockerHint,
        tone: "company",
        canCreateInvoice: false,
      };
    }
    return {
      headline: "Rechnung an Ihr Unternehmen",
      detail: ref
        ? `Ref. ${ref} · in Abrechnung / Monatsexport`
        : "Fahrt in Abrechnung → Export oder Monatsrechnung",
      tone: "company",
      canCreateInvoice: false,
    };
  }

  return {
    headline: "Ihr Unternehmen zahlt",
    detail: ref ? `Interne Ref. ${ref} · Rechnung nach Abschluss` : "Rechnung nach Fahrtabschluss über Abrechnung",
    tone: "company",
    canCreateInvoice: false,
  };
}

export function companyInvoiceBlockerLabel(code) {
  const m = {
    ride_not_completed: "Fahrt noch nicht abgeschlossen",
    missing_billing_reference: "Interne Referenz fehlt",
    missing_snapshot: "Finanzdaten fehlen",
    billing_status_not_invoice_eligible: "Bereits abgerechnet oder gesperrt",
    invoice_already_created: "Rechnung existiert bereits",
    payer_not_company: "Nur bei Firmen-Rechnungszahlung",
    medical_use_ride_invoice_flow: "Krankenfahrt — separater Rechnungs-Flow",
    cancelled_ride: "Stornierte Fahrt",
  };
  return m[code] ?? code ?? "Noch nicht rechnungsbereit";
}

/** @param {Record<string, unknown> | null | undefined} ride */
export function needsActivePoll(ride) {
  if (!ride?.id) return false;
  return !TERMINAL_STATUSES.has(String(ride.status ?? ""));
}
