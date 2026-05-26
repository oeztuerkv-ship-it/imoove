import type { PanelInvoiceItem } from "../../db/panelInvoicesData.js";
import type { PartnerInvoicePdfLineItem } from "./partnerInvoicePdf.js";

function pickStr(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Einheitliche Zeilen-Untertitel für PDF (Route, Code, Datum, Fahrt-ID). */
export function invoiceItemPdfSubline(
  item: PanelInvoiceItem,
  meta?: Record<string, unknown>,
): string | undefined {
  const m = meta ?? {};
  const from = pickStr(m, "from", "fromFull", "pickup");
  const to = pickStr(m, "to", "toFull", "dropoff");
  const date = pickStr(m, "date", "rideDate", "serviceDate");
  const code = pickStr(m, "code", "accessCode", "voucherCode");
  const km = m.distanceKm ?? m.distance_km;
  const parts: string[] = [];
  if (date) parts.push(date);
  if (from && to) parts.push(`${from} → ${to}`);
  else if (from || to) parts.push(from || to);
  if (typeof km === "number" && Number.isFinite(km)) parts.push(`${km.toFixed(1)} km`);
  if (code) parts.push(`Code: ${code}`);
  if (item.rideId) parts.push(`Fahrt ${item.rideId}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function mapPanelInvoiceItemsForPdf(
  items: Array<PanelInvoiceItem & { metadata?: Record<string, unknown> }>,
): PartnerInvoicePdfLineItem[] {
  return items.map((item, index) => ({
    position: index + 1,
    description: item.description,
    detail: invoiceItemPdfSubline(item, item.metadata),
    quantity: item.quantity,
    unitNet: item.unitNet,
    vatRate: item.vatRate,
    lineNet: item.lineNet,
    lineVat: item.lineVat,
    lineGross: item.lineGross,
  }));
}
