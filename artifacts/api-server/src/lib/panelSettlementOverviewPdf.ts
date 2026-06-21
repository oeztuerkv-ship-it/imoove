import PDFDocument from "pdfkit";

import type { PanelSettlementOverviewExportSnapshot } from "../db/panelOverviewSettlementData";
import { ONRODA_INVOICE_BRAND, ONRODA_INVOICE_SELLER } from "./invoice/invoiceBrand";
import {
  createPdfContext,
  INVOICE_LAYOUT,
  INVOICE_MARGINS,
  type InvoicePdfContext,
} from "./invoice/invoiceLayout";
import {
  drawInvoiceFooterOnCurrentPage,
  drawInvoiceTableHeader,
  drawInvoiceTableRow,
  drawInvoiceTotalsCard,
  drawOnrodaLogoBlock,
  drawPartyColumns,
  type InvoiceTableColumn,
  type InvoiceTableRow,
} from "./invoice/invoicePdfComponents";

export type PanelSettlementOverviewPdfCompany = {
  name: string;
  addressLines: string[];
  vatId: string | null;
  taxId: string | null;
};

export type PanelSettlementOverviewPdfInput = {
  company: PanelSettlementOverviewPdfCompany;
  snapshot: PanelSettlementOverviewExportSnapshot;
  generatedAt: Date;
};

function fmtEuro(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toFixed(2).replace(".", ",")} €`;
}

function fmtPct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const pct = rate * 100;
  return Number.isInteger(pct) ? `${pct} %` : `${pct.toFixed(1).replace(".", ",")} %`;
}

function hexColor(doc: PDFDocument, hex: string) {
  doc.fillColor(hex);
}

function drawSettlementPageHeader(ctx: InvoicePdfContext, periodTitle: string): number {
  const { doc } = ctx;
  const top = INVOICE_MARGINS.top;
  const left = ctx.contentLeft;
  const right = ctx.contentRight;

  const logoBottom = drawOnrodaLogoBlock(doc, left, top, 1);

  const titleX = right - 180;
  doc.font("Helvetica-Bold").fontSize(14);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("ABRECHNUNG", titleX, top, { width: 180, align: "right" });
  doc.font("Helvetica").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text("Ihre Abrechnungsübersicht", titleX, top + 20, { width: 180, align: "right" });
  doc.font("Helvetica-Bold").fontSize(11);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text(periodTitle, titleX, top + 36, { width: 180, align: "right" });

  const lineY = Math.max(logoBottom + 6, top + INVOICE_LAYOUT.headerHeight - 8);
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(0.75).strokeColor(ONRODA_INVOICE_BRAND.accent).stroke();

  return lineY + INVOICE_LAYOUT.sectionGap;
}

function drawSettlementMetaBar(
  ctx: InvoicePdfContext,
  items: Array<{ label: string; value: string }>,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const h = INVOICE_LAYOUT.metaBarHeight;
  doc.roundedRect(ctx.contentLeft, y, ctx.contentWidth, h, 6).fill(ONRODA_INVOICE_BRAND.surface);

  const colW = ctx.contentWidth / items.length;
  items.forEach((item, i) => {
    const x = ctx.contentLeft + 14 + i * colW;
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(item.label.toUpperCase(), x, y + 10, { width: colW - 20 });
    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(item.value, x, y + 22, { width: colW - 20 });
  });

  return y + h + INVOICE_LAYOUT.sectionGap;
}

function companyRecipientLines(company: PanelSettlementOverviewPdfCompany): string[] {
  const lines = [...company.addressLines];
  if (company.vatId?.trim()) lines.push(`USt-IdNr.: ${company.vatId.trim()}`);
  if (company.taxId?.trim()) lines.push(`Steuernummer: ${company.taxId.trim()}`);
  if (lines.length === 0 && !company.vatId && !company.taxId) {
    lines.push("Adresse und Steuerdaten noch nicht im Mandantenstamm hinterlegt.");
  }
  return lines;
}

function paymentTableColumns(contentWidth: number): InvoiceTableColumn[] {
  const countW = 64;
  const amountW = 96;
  const typeW = contentWidth - countW - amountW;
  return [
    { key: "type", title: "Zahlungsart", width: typeW, align: "left" },
    { key: "amount", title: "Betrag", width: amountW, align: "right" },
    { key: "count", title: "Anzahl", width: countW, align: "right" },
  ];
}

function drawInfoBox(ctx: InvoicePdfContext, title: string, body: string): number {
  const { doc } = ctx;
  const y = ctx.y;
  const pad = 14;
  doc.font("Helvetica").fontSize(9);
  const bodyH = doc.heightOfString(body, { width: ctx.contentWidth - pad * 2 });
  const boxH = 28 + bodyH;
  doc.roundedRect(ctx.contentLeft, y, ctx.contentWidth, boxH, 8).fillAndStroke(ONRODA_INVOICE_BRAND.surface, ONRODA_INVOICE_BRAND.border);
  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(title, ctx.contentLeft + pad, y + pad, { width: ctx.contentWidth - pad * 2 });
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text(body, ctx.contentLeft + pad, y + pad + 16, { width: ctx.contentWidth - pad * 2 });
  return y + boxH + INVOICE_LAYOUT.sectionGap;
}

export function buildPanelSettlementOverviewPdf(input: PanelSettlementOverviewPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { company, snapshot, generatedAt } = input;
    const { settlement, paymentStats: ps, completedRides, commissionRate } = snapshot;
    const generatedLabel = generatedAt.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let ctx = createPdfContext(doc, 0);
    ctx.y = drawSettlementPageHeader(ctx, snapshot.periodTitle);

    ctx.y = drawSettlementMetaBar(ctx, [
      { label: "Zeitraum", value: snapshot.periodDescription },
      { label: "Erstellt am", value: `${generatedLabel}` },
      { label: "Abgeschlossene Fahrten", value: String(completedRides) },
    ]);

    ctx.y = drawPartyColumns(
      ctx,
      {
        title: "Plattform",
        name: ONRODA_INVOICE_BRAND.productName,
        lines: [`${ONRODA_INVOICE_SELLER.tradingName}`, ONRODA_INVOICE_BRAND.website],
      },
      {
        title: "Abrechnung für",
        name: company.name || "Unternehmen",
        lines: companyRecipientLines(company),
      },
    );

    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text("ABRECHNUNGSSUMMEN", ctx.contentLeft, ctx.y);
    ctx.y += 18;

    const commissionLabel =
      commissionRate != null
        ? `ONRODA-Provision (${fmtPct(commissionRate)})`
        : "ONRODA-Provision";

    ctx.y = drawInvoiceTotalsCard(ctx, {
      netLabel: "Brutto (abgerechnet)",
      net: fmtEuro(settlement.grossAmount),
      vatLabel: commissionLabel,
      vat: fmtEuro(settlement.commissionAmount),
      grossLabel: "Ihr Anteil",
      gross: fmtEuro(settlement.operatorPayoutAmount),
    });

    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text("ZAHLUNGSARTEN (ABGERECHNET)", ctx.contentLeft, ctx.y);
    ctx.y += 12;

    const columns = paymentTableColumns(ctx.contentWidth);
    ctx.y = drawInvoiceTableHeader(ctx, columns);
    const paymentRows: InvoiceTableRow[] = [
      {
        cells: { type: "Karte", amount: fmtEuro(ps.cardGrossAmount), count: String(ps.cardRideCount) },
      },
      {
        cells: { type: "Bar", amount: fmtEuro(ps.cashGrossAmount), count: String(ps.cashRideCount) },
      },
    ];
    for (const row of paymentRows) {
      ctx.y = drawInvoiceTableRow(ctx, columns, row);
    }
    ctx.y += INVOICE_LAYOUT.sectionGap;

    ctx.y = drawInfoBox(
      ctx,
      "Trinkgeld (informativ)",
      `Trinkgeld gesamt: ${fmtEuro(ps.tipTotal)} · 100 % an Fahrerinnen und Fahrer. Trinkgeld ist nicht Teil der ONRODA-Abrechnung.`,
    );

    if (ps.pendingPaymentCount > 0 || ps.failedPaymentCount > 0) {
      const hints: string[] = [];
      if (ps.pendingPaymentCount > 0) hints.push(`Offen / reserviert: ${ps.pendingPaymentCount}`);
      if (ps.failedPaymentCount > 0) hints.push(`Fehlgeschlagen: ${ps.failedPaymentCount}`);
      ctx.y = drawInfoBox(ctx, "Kartenzahlungen — Hinweise", hints.join(" · "));
    }

    ctx.y += 4;
    doc.font("Helvetica").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(
      "Grundlage: abgeschlossene Fahrten mit Finanz-Snapshot zum Abrechnungszeitpunkt. Der Provisionssatz gilt für neu abgeschlossene Fahrten; Änderungen erfolgen durch den Plattform-Admin.",
      ctx.contentLeft,
      ctx.y,
      { width: ctx.contentWidth },
    );
    ctx.y += 28;

    doc.font("Helvetica").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(
      "Diese Übersicht dient der Information für Ihren Steuerberater und ersetzt keine steuerliche Beratung.",
      ctx.contentLeft,
      ctx.y,
      { width: ctx.contentWidth, align: "center" },
    );

    drawInvoiceFooterOnCurrentPage(ctx, 1, 1);
    doc.end();
  });
}

export function companyAddressLinesForSettlementPdf(company: {
  name: string;
  billingName: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingPostalCode: string;
  billingCity: string;
  billingCountry: string;
}): { displayName: string; addressLines: string[] } {
  const useBilling = Boolean(company.billingName?.trim() || company.billingAddressLine1?.trim());
  const displayName = (useBilling ? company.billingName : company.name)?.trim() || company.name?.trim() || "Unternehmen";
  const lines: string[] = [];
  if (useBilling) {
    if (company.billingAddressLine1?.trim()) lines.push(company.billingAddressLine1.trim());
    if (company.billingAddressLine2?.trim()) lines.push(company.billingAddressLine2.trim());
    const cityLine = [company.billingPostalCode, company.billingCity].filter(Boolean).join(" ").trim();
    if (cityLine) lines.push(cityLine);
    if (company.billingCountry?.trim() && company.billingCountry.trim() !== "DE") {
      lines.push(company.billingCountry.trim());
    }
  } else {
    if (company.addressLine1?.trim()) lines.push(company.addressLine1.trim());
    if (company.addressLine2?.trim()) lines.push(company.addressLine2.trim());
    const cityLine = [company.postalCode, company.city].filter(Boolean).join(" ").trim();
    if (cityLine) lines.push(cityLine);
    if (company.country?.trim() && company.country.trim() !== "DE") {
      lines.push(company.country.trim());
    }
  }
  return { displayName, addressLines: lines };
}
