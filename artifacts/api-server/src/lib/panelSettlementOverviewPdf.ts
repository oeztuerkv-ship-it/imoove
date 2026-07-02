import PDFDocument from "pdfkit";

import type { PanelSettlementOverviewExportSnapshot } from "../db/panelOverviewSettlementData";
import { ONRODA_INVOICE_BRAND, ONRODA_INVOICE_SELLER, sellerAddressLines } from "./invoice/invoiceBrand";
import {
  createPdfContext,
  INVOICE_LAYOUT,
  INVOICE_MARGINS,
  INVOICE_PAGE,
  type InvoicePdfContext,
} from "./invoice/invoiceLayout";
import {
  drawInvoiceFooterOnCurrentPage,
  drawInvoiceTableHeader,
  drawInvoiceTableRow,
  drawInvoiceTotalsCard,
  drawOnrodaLogoBlock,
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

type SettlementHeaderInput = {
  documentNumber: string;
  kindLabel: string;
  headline: string;
};

function drawSettlementPageHeader(ctx: InvoicePdfContext, header: SettlementHeaderInput): number {
  const { doc } = ctx;
  const top = INVOICE_MARGINS.top;
  const left = ctx.contentLeft;
  const right = ctx.contentRight;
  const rightColW = 210;
  const rightX = right - rightColW;

  const logoBottom = drawOnrodaLogoBlock(doc, left, top, 1);

  let rightY = top;
  doc.font("Helvetica-Bold").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text(header.documentNumber, rightX, rightY, { width: rightColW, align: "right" });
  rightY += 13;

  doc.font("Helvetica-Bold").fontSize(14);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("ABRECHNUNG", rightX, rightY, { width: rightColW, align: "right" });
  rightY += 18;

  doc.font("Helvetica").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text("Ihre Abrechnungsübersicht", rightX, rightY, { width: rightColW, align: "right" });
  rightY += 14;

  doc.font("Helvetica-Bold").fontSize(11);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  const headlineH = doc.heightOfString(header.headline, { width: rightColW, align: "right" });
  doc.text(header.headline, rightX, rightY, { width: rightColW, align: "right" });
  rightY += headlineH + 4;

  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text(header.kindLabel, rightX, rightY, { width: rightColW, align: "right" });
  rightY += 12;

  const blockBottom = Math.max(logoBottom, rightY) + 8;
  doc.moveTo(left, blockBottom).lineTo(right, blockBottom).lineWidth(0.75).strokeColor(ONRODA_INVOICE_BRAND.accent).stroke();

  return blockBottom + INVOICE_LAYOUT.sectionGap;
}

function drawSettlementMetaBar(
  ctx: InvoicePdfContext,
  items: Array<{ label: string; value: string }>,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const colW = ctx.contentWidth / items.length;
  const labelPad = 14;
  const labelTop = 10;
  const labelValueGap = 6;
  const textW = colW - 20;

  doc.font("Helvetica").fontSize(8);
  const labelHeights = items.map((item) =>
    doc.heightOfString(item.label.toUpperCase(), { width: textW }),
  );
  const maxLabelH = Math.max(...labelHeights);

  doc.font("Helvetica-Bold").fontSize(10);
  let maxValueH = 0;
  for (const item of items) {
    const h = doc.heightOfString(item.value, { width: textW });
    maxValueH = Math.max(maxValueH, h);
  }

  const valueY = y + labelTop + maxLabelH + labelValueGap;
  const h = Math.max(INVOICE_LAYOUT.metaBarHeight, valueY - y + maxValueH + 12);

  doc.roundedRect(ctx.contentLeft, y, ctx.contentWidth, h, 6).fill(ONRODA_INVOICE_BRAND.surface);

  items.forEach((item, i) => {
    const x = ctx.contentLeft + labelPad + i * colW;
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(item.label.toUpperCase(), x, y + labelTop, { width: textW });
    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(item.value, x, valueY, { width: textW });
  });

  return y + h + INVOICE_LAYOUT.sectionGap;
}

type SettlementPartyCard = {
  title: string;
  name: string;
  lines: string[];
};

function measureSettlementPartyCard(doc: PDFDocument, block: SettlementPartyCard, colW: number): number {
  const pad = 16;
  const innerW = colW - pad * 2;
  let h = pad;
  doc.font("Helvetica").fontSize(7.5);
  h += doc.heightOfString(block.title.toUpperCase(), { width: innerW }) + 8;
  doc.font("Helvetica-Bold").fontSize(11);
  h += doc.heightOfString(block.name, { width: innerW }) + 8;
  doc.font("Helvetica").fontSize(9.5);
  for (const line of block.lines) {
    h += doc.heightOfString(line, { width: innerW }) + 3;
  }
  return h + pad;
}

function drawSettlementPartyCards(
  ctx: InvoicePdfContext,
  seller: SettlementPartyCard,
  recipient: SettlementPartyCard,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const gap = 12;
  const colW = (ctx.contentWidth - gap) / 2;
  const leftH = measureSettlementPartyCard(doc, seller, colW);
  const rightH = measureSettlementPartyCard(doc, recipient, colW);
  const boxH = Math.max(leftH, rightH);

  const drawCard = (block: SettlementPartyCard, x: number) => {
    doc.roundedRect(x, y, colW, boxH, 8).fillAndStroke(ONRODA_INVOICE_BRAND.card, ONRODA_INVOICE_BRAND.border);
    doc.rect(x, y + 8, 3, boxH - 16).fill(ONRODA_INVOICE_BRAND.accent);

    const innerX = x + 16;
    const innerW = colW - 28;
    let ly = y + 16;

    doc.font("Helvetica").fontSize(7.5);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(block.title.toUpperCase(), innerX, ly, { width: innerW, characterSpacing: 0.6 });
    ly += doc.heightOfString(block.title.toUpperCase(), { width: innerW }) + 8;

    doc.font("Helvetica-Bold").fontSize(11);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(block.name, innerX, ly, { width: innerW });
    ly += doc.heightOfString(block.name, { width: innerW }) + 8;

    doc.font("Helvetica").fontSize(9.5);
    hexColor(doc, "#4B5563");
    for (const line of block.lines) {
      doc.text(line, innerX, ly, { width: innerW });
      ly += doc.heightOfString(line, { width: innerW }) + 3;
    }
  };

  drawCard(seller, ctx.contentLeft);
  drawCard(recipient, ctx.contentLeft + colW + gap);

  return y + boxH + INVOICE_LAYOUT.sectionGap;
}

function drawSettlementInfoCard(
  ctx: InvoicePdfContext,
  title: string,
  lines: Array<{ text: string; bold?: boolean; muted?: boolean }>,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const pad = 16;
  const innerW = ctx.contentWidth - pad * 2 - 8;
  const titleGap = 10;
  const lineGap = 5;

  doc.font("Helvetica-Bold").fontSize(10);
  const titleH = doc.heightOfString(title, { width: innerW });

  let bodyH = 0;
  for (const line of lines) {
    doc.font(line.bold ? "Helvetica-Bold" : "Helvetica").fontSize(line.bold ? 10 : 9);
    bodyH += doc.heightOfString(line.text, { width: innerW }) + lineGap;
  }
  if (lines.length > 0) bodyH -= lineGap;

  const boxH = pad + titleH + titleGap + bodyH + pad;

  doc.roundedRect(ctx.contentLeft, y, ctx.contentWidth, boxH, 8).fillAndStroke(ONRODA_INVOICE_BRAND.surface, ONRODA_INVOICE_BRAND.border);
  doc.rect(ctx.contentLeft, y + 10, 3, boxH - 20).fill(ONRODA_INVOICE_BRAND.accent);

  const textX = ctx.contentLeft + pad + 4;
  let ly = y + pad;

  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(title, textX, ly, { width: innerW });
  ly += titleH + titleGap;

  for (const line of lines) {
    doc.font(line.bold ? "Helvetica-Bold" : "Helvetica").fontSize(line.bold ? 10 : 9);
    hexColor(doc, line.muted ? ONRODA_INVOICE_BRAND.muted : ONRODA_INVOICE_BRAND.text);
    doc.text(line.text, textX, ly, { width: innerW });
    ly += doc.heightOfString(line.text, { width: innerW }) + lineGap;
  }

  return y + boxH + INVOICE_LAYOUT.sectionGap;
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
    ctx.y = drawSettlementPageHeader(ctx, {
      documentNumber: snapshot.documentNumber,
      kindLabel: snapshot.periodKindLabel,
      headline: snapshot.periodHeadline,
    });

    ctx.y = drawSettlementMetaBar(ctx, [
      { label: "Belegnummer", value: snapshot.documentNumber },
      { label: "Zeitraum", value: snapshot.periodDescription },
      { label: "Erstellt am", value: generatedLabel },
      { label: "Abgeschlossene Fahrten", value: String(completedRides) },
    ]);

    ctx.y = drawSettlementPartyCards(
      ctx,
      {
        title: "Plattform",
        name: ONRODA_INVOICE_BRAND.productName,
        lines: [ONRODA_INVOICE_SELLER.tradingName, ...sellerAddressLines(), ONRODA_INVOICE_BRAND.website],
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
      grossUseAccent: false,
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

    ctx.y = drawSettlementInfoCard(ctx, "Trinkgeld (informativ)", [
      { text: `Trinkgeld gesamt: ${fmtEuro(ps.tipTotal)}`, bold: true },
      {
        text: "100 % an Fahrerinnen und Fahrer · nicht Teil der ONRODA-Abrechnung.",
        muted: true,
      },
    ]);

    if (ps.pendingPaymentCount > 0 || ps.failedPaymentCount > 0) {
      const hints: string[] = [];
      if (ps.pendingPaymentCount > 0) hints.push(`Offen / reserviert: ${ps.pendingPaymentCount}`);
      if (ps.failedPaymentCount > 0) hints.push(`Fehlgeschlagen: ${ps.failedPaymentCount}`);
      ctx.y = drawSettlementInfoCard(ctx, "Kartenzahlungen — Hinweise", [{ text: hints.join(" · ") }]);
    }

    ctx.y += 4;
    const footerBrandY = INVOICE_PAGE.height - INVOICE_MARGINS.bottom - 28;
    const disclaimerGapAboveFooter = 14;
    const scopeText = `Grundlage: abgeschlossene Fahrten mit Finanz-Snapshot zum Abrechnungszeitpunkt. ${snapshot.scopeNote} Der Provisionssatz gilt für neu abgeschlossene Fahrten; Änderungen erfolgen durch den Plattform-Admin.`;
    const disclaimerText =
      "Diese Übersicht dient der Information für Ihren Steuerberater und ersetzt keine steuerliche Beratung.";

    doc.font("Helvetica").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    const scopeH = doc.heightOfString(scopeText, { width: ctx.contentWidth });
    doc.text(scopeText, ctx.contentLeft, ctx.y, { width: ctx.contentWidth });

    const disclaimerH = doc.heightOfString(disclaimerText, { width: ctx.contentWidth });
    let disclaimerY = footerBrandY - disclaimerGapAboveFooter - disclaimerH;
    const minDisclaimerY = ctx.y + scopeH + INVOICE_LAYOUT.sectionGap;
    if (disclaimerY < minDisclaimerY) disclaimerY = minDisclaimerY;

    doc.text(disclaimerText, ctx.contentLeft, disclaimerY, { width: ctx.contentWidth, align: "center" });

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
