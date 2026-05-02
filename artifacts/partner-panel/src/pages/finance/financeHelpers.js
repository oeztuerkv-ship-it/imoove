/** @param {unknown} v */
export function formatMoney(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** @param {unknown} ride */
export function rideFareAmount(ride) {
  const n = Number(ride?.finalFare ?? ride?.estimatedFare ?? 0);
  return Number.isNaN(n) ? 0 : n;
}

/** @param {unknown} ride */
export function getPartnerMeta(ride) {
  const m = ride?.partnerBookingMeta;
  return m && typeof m === "object" ? m : null;
}

export function defaultMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** @param {string} ym YYYY-MM */
export function formatYmDe(ym) {
  const parts = String(ym).split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m) return ym;
  try {
    return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  } catch {
    return ym;
  }
}

export function rideKindLabel(k) {
  const m = { standard: "Normal", medical: "Krankenfahrt", voucher: "Gutschein", company: "Firma" };
  return m[k] ?? k ?? "—";
}

export function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Firma",
    insurance: "Kostenträger",
    voucher: "Gutschein",
    third_party: "Dritter",
  };
  return m[k] ?? k ?? "—";
}

export function flowLabel(f) {
  const m = { hotel_guest: "Hotel", medical_patient: "Patient H/R", medical_series_leg: "Serie" };
  return m[f] ?? f ?? "—";
}

/** Lokales Kalenderdatum yyyy-mm-dd */
export function localYmd(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getFullYear();
  const mo = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/**
 * KPI-Ableitung aus geladenen Fahrten (aktueller Snapshot-Monat).
 * @param {Record<string, unknown>[]} rides
 * @param {string} snapshotMonthYm
 */
export function deriveFinanceKpis(rides, snapshotMonthYm) {
  const todayYmd = localYmd(new Date());
  let revenueToday = 0;
  let revenueMonth = 0;
  let openInvoiceCount = 0;
  let pendingPayoutSum = 0;
  let medicalOpenCount = 0;
  /** @type {string | null} */
  let lastSettlementLabel = null;

  for (const r of rides) {
    const fare = rideFareAmount(r);
    revenueMonth += fare;

    const created = r?.createdAt ? localYmd(r.createdAt) : null;
    if (created && created === todayYmd) revenueToday += fare;

    const meta = getPartnerMeta(r);
    const invStatusRaw = typeof meta?.invoice_status === "string" ? meta.invoice_status : "";
    const invStatus = invStatusRaw.toLowerCase();
    const invNum = typeof meta?.invoice_number === "string" && meta.invoice_number.trim() ? meta.invoice_number.trim() : "";

    const invoiceClosed = invStatus === "paid" || invStatus === "cancelled" || invStatus === "storniert";
    if (!invoiceClosed && (invNum || invStatus === "draft" || invStatus === "created" || invStatus === "sent")) {
      openInvoiceCount += 1;
    }

    const payout = Number(meta?.partner_payout_amount ?? NaN);
    if (!Number.isNaN(payout) && !invoiceClosed && (invStatus === "created" || invStatus === "sent" || invStatus === "draft")) {
      pendingPayoutSum += payout;
    }

    const medical = meta?.medical_ride === true || r?.rideKind === "medical";
    if (medical && !invoiceClosed) {
      medicalOpenCount += 1;
    }

    const paidAt = typeof meta?.invoice_paid_at === "string" ? meta.invoice_paid_at : "";
    const createdInv = typeof meta?.invoice_created_at === "string" ? meta.invoice_created_at : "";
    const candidates = [paidAt, createdInv].filter(Boolean);
    for (const iso of candidates) {
      if (!lastSettlementLabel || iso > lastSettlementLabel) lastSettlementLabel = iso;
    }
  }

  let lastSettlementDisplay = "—";
  if (lastSettlementLabel) {
    try {
      lastSettlementDisplay = new Date(lastSettlementLabel).toLocaleString("de-DE", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      lastSettlementDisplay = lastSettlementLabel;
    }
  }

  return {
    snapshotMonthYm,
    revenueToday,
    revenueMonth,
    openInvoiceCount,
    pendingPayoutSum,
    medicalOpenCount,
    lastSettlementDisplay,
    rideCount: rides.length,
  };
}

/**
 * @param {Record<string, unknown>[]} rides
 */
export function derivePayoutSummary(rides) {
  /** @type {{ at: string; amount: number; number: string } | null} */
  let lastPaid = null;
  let pendingSum = 0;
  let pendingCount = 0;

  for (const r of rides) {
    const meta = getPartnerMeta(r);
    const invStatus = String(meta?.invoice_status ?? "").toLowerCase();
    const payout = Number(meta?.partner_payout_amount ?? NaN);
    const paidAt = typeof meta?.invoice_paid_at === "string" ? meta.invoice_paid_at : "";
    const num = typeof meta?.invoice_number === "string" ? meta.invoice_number : "";

    if (invStatus === "paid" && !Number.isNaN(payout) && paidAt) {
      if (!lastPaid || paidAt > lastPaid.at) {
        lastPaid = { at: paidAt, amount: payout, number: num };
      }
    }
    if ((invStatus === "created" || invStatus === "sent" || invStatus === "draft") && !Number.isNaN(payout) && payout > 0) {
      pendingSum += payout;
      pendingCount += 1;
    }
  }

  let lastPaidDisplay = "—";
  if (lastPaid) {
    try {
      lastPaidDisplay = `${formatMoney(lastPaid.amount)} · ${new Date(lastPaid.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} (${lastPaid.number || "—"})`;
    } catch {
      lastPaidDisplay = formatMoney(lastPaid.amount);
    }
  }

  return { lastPaidDisplay, pendingSum, pendingCount };
}

/** IBAN grob maskieren für Anzeige */
export function maskIban(iban) {
  const s = String(iban || "").replace(/\s/g, "");
  if (s.length < 8) return iban ? "•••• (unvollständig)" : "";
  return `${s.slice(0, 4)} •••• •••• ${s.slice(-4)}`;
}

/** Rechnungs-Zeilen aus Fahrten (nur wo Abrechnungs-/Rechnungsbezug). */
export function ridesToInvoiceRows(rides) {
  return rides
    .map((r) => {
      const meta = getPartnerMeta(r);
      const invStatus = typeof meta?.invoice_status === "string" ? meta.invoice_status : "";
      const invNum = typeof meta?.invoice_number === "string" ? meta.invoice_number.trim() : "";
      if (!invNum && !invStatus) return null;
      const payer =
        (typeof meta?.insurance_name === "string" && meta.insurance_name) ||
        (typeof r?.customerName === "string" && r.customerName) ||
        payerKindLabel(r?.payerKind) ||
        "—";
      const amount = rideFareAmount(r);
      const gross = Number(meta?.gross_ride_amount ?? NaN);
      const displayAmount = !Number.isNaN(gross) ? gross : amount;
      const dateIso =
        (typeof meta?.invoice_created_at === "string" && meta.invoice_created_at) ||
        (typeof r?.createdAt === "string" && r.createdAt) ||
        "";
      const from = typeof r?.from === "string" ? r.from.trim() : "";
      const to = typeof r?.to === "string" ? r.to.trim() : "";
      const rideRoute = from || to ? `${from || "—"} → ${to || "—"}` : "—";

      return {
        id: r.id,
        number: invNum || "—",
        payer,
        amount: displayAmount,
        status: invStatus || "draft",
        dateIso,
        rideKind: r.rideKind,
        rideRoute,
      };
    })
    .filter(Boolean);
}

/**
 * @param {string} status
 * @returns {{ label: string; tone: string }}
 */
export function invoiceStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "bezahlt") return { label: "Bezahlt", tone: "ok" };
  if (s === "cancelled" || s === "storniert" || s === "void") return { label: "Storniert", tone: "soft" };
  if (s === "sent" || s === "versendet") return { label: "In Prüfung", tone: "warn" };
  if (s === "created" || s === "draft" || !s) return { label: "Offen", tone: "review" };
  return { label: s, tone: "neutral" };
}

export function filterMedicalRides(rides) {
  return rides.filter((r) => {
    const meta = getPartnerMeta(r);
    return meta?.medical_ride === true || r?.rideKind === "medical";
  });
}
