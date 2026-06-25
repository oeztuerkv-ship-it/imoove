import PDFDocument from "pdfkit";
import { ONRODA_INVOICE_BRAND } from "./invoice/invoiceBrand.js";
import { createPdfContext, INVOICE_MARGINS, INVOICE_PAGE } from "./invoice/invoiceLayout.js";
import { drawOnrodaLogoBlock } from "./invoice/invoicePdfComponents.js";

export type FixedPriceVoucherPdfInput = {
  codePlain: string;
  label: string;
  companyName: string;
  fromFull: string;
  toFull: string;
  distanceKm: number;
  vehicleLabel: string;
  priceEur: number;
  basePriceEur: number | null;
  vehicleSurchargeEur: number | null;
  paidAtIso: string;
};

function fmtMoney(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function fmtDateDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function renderFixedPriceVoucherPdf(input: FixedPriceVoucherPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ctx = createPdfContext(doc, 0, INVOICE_MARGINS.top);
    let y = drawOnrodaLogoBlock(doc, ctx.contentLeft, ctx.y, 1);
    y += 18;

    doc.font("Helvetica-Bold").fillColor(ONRODA_INVOICE_BRAND.text).fontSize(20);
    doc.text("Festpreis-Gutschein", ctx.contentLeft, y);
    y += 28;

    doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(10);
    doc.text(`Ausgestellt für: ${input.companyName}`, ctx.contentLeft, y);
    y += 14;
    doc.text(`Kaufdatum: ${fmtDateDe(input.paidAtIso)}`, ctx.contentLeft, y);
    y += 22;

    if (input.label.trim()) {
      doc.font("Helvetica-Bold").fillColor(ONRODA_INVOICE_BRAND.text).fontSize(11);
      doc.text(input.label.trim(), ctx.contentLeft, y);
      y += 18;
    }

    const boxW = ctx.contentWidth;
    doc.roundedRect(ctx.contentLeft, y, boxW, 88, 6).fillAndStroke("#f8fafc", "#e2e8f0");
    const innerX = ctx.contentLeft + 14;
    let innerY = y + 12;
    doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(9).text("Route", innerX, innerY);
    innerY += 12;
    doc.font("Helvetica-Bold").fillColor(ONRODA_INVOICE_BRAND.text).fontSize(11);
    doc.text(`Von: ${input.fromFull}`, innerX, innerY, { width: boxW - 28 });
    innerY += 16;
    doc.text(`Nach: ${input.toFull}`, innerX, innerY, { width: boxW - 28 });
    y += 100;

    const rows: [string, string][] = [
      ["Strecke", `${input.distanceKm.toFixed(1).replace(".", ",")} km`],
      ["Fahrzeugklasse", input.vehicleLabel],
    ];
    if (input.basePriceEur != null && input.vehicleSurchargeEur != null && input.vehicleSurchargeEur > 0) {
      rows.push(["Festpreis Basis", fmtMoney(input.basePriceEur)]);
      rows.push(["Fahrzeug-Aufschlag", fmtMoney(input.vehicleSurchargeEur)]);
    }
    rows.push(["Gutscheinwert (Festpreis)", fmtMoney(input.priceEur)]);

    for (const [label, value] of rows) {
      doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(10).text(label, ctx.contentLeft, y);
      doc.font("Helvetica-Bold").fillColor(ONRODA_INVOICE_BRAND.text).text(value, ctx.contentLeft, y, {
        width: ctx.contentWidth,
        align: "right",
      });
      y += 18;
    }

    y += 10;
    doc.roundedRect(ctx.contentLeft, y, boxW, 64, 8).fillAndStroke("#fff7ed", "#fdba74");
    doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(9).text("Ihr Gutschein-Code", ctx.contentLeft + 16, y + 10);
    doc
      .font("Helvetica-Bold")
      .fillColor("#c2410c")
      .fontSize(22)
      .text(input.codePlain, ctx.contentLeft + 16, y + 26, { characterSpacing: 2 });
    y += 84;

    doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(9);
    doc.text(
      "Einlösung in der Onroda-App oder bei Ihrer Buchung: Code eingeben — Route und Festpreis sind an diesen Gutschein gebunden. " +
        "Gültig für eine Fahrt (1× Nutzung), sofern nicht anders angegeben.",
      ctx.contentLeft,
      y,
      { width: ctx.contentWidth, lineGap: 2 },
    );

    const footerY = INVOICE_PAGE.height - INVOICE_MARGINS.bottom - 12;
    doc.font("Helvetica").fillColor(ONRODA_INVOICE_BRAND.muted).fontSize(8);
    doc.text("Onroda · Festpreis-Gutschein · Kein Umsatzsteuerausweis auf Gutschein-PDF", ctx.contentLeft, footerY, {
      width: ctx.contentWidth,
      align: "center",
    });

    doc.end();
  });
}

export function vehicleLabelDe(vehicle: string): string {
  const v = vehicle.trim().toLowerCase();
  if (v === "xl" || v.includes("großraum")) return "XL / Großraum";
  if (v === "wheelchair" || v.includes("rollstuhl")) return "Rollstuhl";
  return "Standard";
}
