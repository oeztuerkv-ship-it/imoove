import { ONRODA_INVOICE_BRAND } from "./invoiceBrand.js";
import { renderPartnerInvoicePdf, roundMoneyEur } from "./partnerInvoicePdf.js";
import type { TransportVoucherRow } from "../../db/krankenInvoicesData.js";

export type KrankenInvoicePdfInput = {
  invoiceNumber: string;
  issueDate: string;
  periodFrom: string;
  periodTo: string;
  senderName: string;
  senderLines: string[];
  recipientName: string;
  recipientLines: string[];
  vouchers: TransportVoucherRow[];
  totalAmount: number;
  commissionAmount: number;
  netAmount: number;
  commissionRatePercent: number;
};

function fmtDateDe(iso: string): string {
  const t = iso.trim();
  if (!t) return "—";
  const d = new Date(t.includes("T") ? t : `${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(n: number): string {
  return `${roundMoneyEur(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function routeShort(from?: string, to?: string): string {
  const a = (from ?? "").trim();
  const b = (to ?? "").trim();
  if (!a && !b) return "—";
  const short = (s: string) => (s.length > 36 ? `${s.slice(0, 33)}…` : s);
  return `${short(a)} → ${short(b)}`;
}

/**
 * Kranken-Sammelrechnung — gleiches Referenz-Layout wie Partner-/Provisions-PDFs.
 * Aussteller = Taxi-Unternehmen; Gesamtbetrag = Summe Fahrpreise.
 */
export function renderKrankenInvoicePdf(input: KrankenInvoicePdfInput): Promise<Buffer> {
  const items = (input.vouchers.length ? input.vouchers : []).map((v, i) => {
    const fare = roundMoneyEur(v.fareAmount);
    return {
      position: i + 1,
      description: v.patientName?.trim() || `Fahrt ${i + 1}`,
      subline: `${fmtDateDe(v.rideReferenceAt ?? v.createdAt)} · ${routeShort(v.rideFromFull, v.rideToFull)}${
        v.distanceKm != null && Number.isFinite(v.distanceKm) ? ` · ${v.distanceKm.toFixed(1)} km` : ""
      }`,
      quantity: 1,
      unitNet: fare,
      vatRate: 0,
      lineNet: fare,
      lineVat: 0,
      lineGross: fare,
    };
  });

  const pctLabel = input.commissionRatePercent.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const notes = [
    `ONRODA-Provision (${pctLabel} %): ${fmtMoney(input.commissionAmount)}`,
    `Auszahlungsbetrag ans Taxi-Unternehmen: ${fmtMoney(input.netAmount)}`,
    "ONRODA dokumentiert die Abrechnung; Zahlung der Krankenkasse gemäß vertraglicher Vereinbarung.",
  ].join("\n");

  return renderPartnerInvoicePdf({
    invoiceNumber: input.invoiceNumber,
    statusLabel: "Sammelrechnung Krankenfahrt",
    issueDate: input.issueDate,
    dueDate: null,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    recipientName: input.recipientName,
    recipientLines: input.recipientLines.filter(Boolean),
    items: items.length
      ? items
      : [
          {
            position: 1,
            description: "Keine Fahrten im Zeitraum",
            quantity: 0,
            unitNet: 0,
            vatRate: 0,
            lineNet: 0,
            lineVat: 0,
            lineGross: 0,
          },
        ],
    subtotalNet: roundMoneyEur(input.totalAmount),
    vatTotal: 0,
    totalGross: roundMoneyEur(input.totalAmount),
    taxRatePercent: 0,
    notes,
    paymentReference: input.invoiceNumber,
    introText: "Krankenfahrten — T-Schein-Fahrten im Abrechnungszeitraum.",
    seller: {
      name: input.senderName,
      lines: input.senderLines.filter(Boolean),
      // IBAN/Steuernr. des Taxi-Partners ggf. später aus Stammdaten; Layout bleibt einheitlich.
    },
  });
}

/** Re-export für Aufrufer, die Brand-Farben erwarten. */
export { ONRODA_INVOICE_BRAND };
