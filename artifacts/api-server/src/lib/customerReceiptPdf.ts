import PDFDocument from "pdfkit";

import {
  resolveCustomerReceiptContext,
  type CustomerReceiptContext,
} from "./customerReceipt.js";
import type { ReceiptDriverInfo } from "./receiptDriverInfo.js";
import type { RideRequest } from "../domain/rideRequest.js";
import { ONRODA_INVOICE_BRAND } from "./invoice/invoiceBrand.js";
import { drawOnrodaLogoBlock } from "./invoice/invoicePdfComponents.js";
import { INVOICE_LAYOUT, INVOICE_MARGINS } from "./invoice/invoiceLayout.js";

function fmtEuro(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toFixed(2).replace(".", ",")} €`;
}

function fmtVatRatePercent(vatRate: number): string {
  const pct = vatRate * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}

function paymentLabelForRide(ctx: CustomerReceiptContext): string {
  const r = ctx.ride;
  if (r.cashConfirmedAt) return "Bar (vom Fahrer bestätigt)";
  if (r.paymentStatus === "refunded") return "Erstattet";
  if (r.paymentStatus === "paid" && String(r.paymentMethod ?? "").toLowerCase().includes("apple")) {
    return "Apple Pay";
  }
  const pm = String(r.paymentMethod ?? "").trim().toLowerCase();
  if (pm === "cash" || pm === "bar") return "Bar";
  if (pm === "card" || pm === "karte") return "Karte";
  if (pm === "apple_pay") return "Apple Pay";
  if (pm === "google_pay") return "Google Pay";
  if (pm === "transportschein" || pm === "medical") return "Krankenkasse / Transportschein";
  return r.paymentMethod ?? "—";
}

function drawRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string, y: number, width: number): number {
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(label, 50, y, { width: width * 0.45 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(value, 50 + width * 0.45, y, {
    width: width * 0.55,
    align: "right",
  });
  return y + 16;
}

export function buildCustomerReceiptPdf(ctx: CustomerReceiptContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { ride: r, driverInfo, issuer, tax, showSteuerlicherBeleg } = ctx;
    const pageWidth = 595.28;
    const contentWidth = pageWidth - 100;
    const rideNr = String(r.id).slice(0, 8).toUpperCase();
    const date = new Date(r.createdAt);
    const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const tipAmount =
      r.tipAmount != null && Number.isFinite(Number(r.tipAmount)) ? Math.max(0, Number(r.tipAmount)) : 0;
    const paymentLabel = paymentLabelForRide(ctx);
    const distanceKm = (r.actualDistanceKm ?? r.distanceKm ?? 0).toFixed(1);

    const left = INVOICE_MARGINS.left;
    const right = pageWidth - INVOICE_MARGINS.right;
    const top = INVOICE_MARGINS.top;

    const logoBottom = drawOnrodaLogoBlock(doc, left, top, 1);

    const titleX = right - 160;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(ONRODA_INVOICE_BRAND.text);
    doc.text("FAHRTQUITTUNG", titleX, top, { width: 160, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor(ONRODA_INVOICE_BRAND.muted);
    doc.text(`Nr. ${rideNr}`, titleX, top + 20, { width: 160, align: "right" });

    const lineY = Math.max(logoBottom + 6, top + INVOICE_LAYOUT.headerHeight - 8);
    doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(0.75).strokeColor(ONRODA_INVOICE_BRAND.accent).stroke();

    let y = lineY + INVOICE_LAYOUT.sectionGap;
    doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(9).text("LEISTUNGSERBRINGER", 50, y);
    y += 16;
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14).text(issuer.name || "Leistungserbringer nicht hinterlegt", 50, y, {
      width: contentWidth,
    });
    y += 20;
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    for (const line of issuer.addressLines) {
      doc.text(line, 50, y, { width: contentWidth });
      y += 14;
    }
    if (issuer.vatId) {
      doc.text(`USt-IdNr.: ${issuer.vatId}`, 50, y);
      y += 14;
    } else if (issuer.taxIdLine) {
      doc.text(issuer.taxIdLine, 50, y);
      y += 14;
    }
    if (issuer.missingNote && !issuer.addressLines.length) {
      doc.fillColor("#b45309").text(issuer.missingNote, 50, y, { width: contentWidth });
      y += 16;
    }

    y += 8;
    doc.moveTo(50, y).lineTo(pageWidth - 50, y).strokeColor("#e5e7eb").stroke();
    y += 14;

    y = drawRow(doc, "Datum", dateStr, y, contentWidth);
    y = drawRow(doc, "Uhrzeit", `${timeStr} Uhr`, y, contentWidth);

    if (tax.gross > 0) {
      y += 4;
      y = drawRow(doc, "Netto", fmtEuro(tax.net), y, contentWidth);
      y = drawRow(doc, `MwSt (${fmtVatRatePercent(tax.vatRate)} %)`, fmtEuro(tax.vatAmount), y, contentWidth);
      y = drawRow(doc, "Brutto (Taxameter)", fmtEuro(tax.gross), y, contentWidth);
      if (tax.fallbackNote) {
        doc.font("Helvetica").fontSize(9).fillColor("#b45309").text(tax.fallbackNote, 50, y, { width: contentWidth });
        y += 28;
      }
    }

    if (tipAmount > 0.005) {
      y = drawRow(doc, "Trinkgeld", fmtEuro(tipAmount), y, contentWidth);
      y = drawRow(doc, "Gesamt (Fahrt + Trinkgeld)", fmtEuro(tax.gross + tipAmount), y, contentWidth);
    }

    y += 6;
    doc.roundedRect(50, y, contentWidth, 72, 8).fillAndStroke("#f9fafb", "#eef2f7");
    doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(9).text("ROUTE", 62, y + 12);
    doc.fillColor("#6b7280").font("Helvetica").fontSize(9).text("Abfahrt", 62, y + 28);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(r.from ?? "—", 62, y + 40, { width: contentWidth - 24 });
    doc.fillColor("#6b7280").font("Helvetica").fontSize(9).text("Ziel", 62, y + 56);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(r.to ?? "—", 110, y + 56, { width: contentWidth - 72 });
    y += 86;

    y = drawRow(
      doc,
      r.actualDistanceKm != null ? "Gefahrene Strecke" : "Geplante Strecke",
      `${distanceKm} km`,
      y,
      contentWidth,
    );
    if (r.actualDurationMinutes != null) {
      y = drawRow(doc, "Fahrtdauer", `${r.actualDurationMinutes} Min`, y, contentWidth);
    }
    if (driverInfo.driverName) {
      y = drawRow(doc, "Fahrer*in", driverInfo.driverName, y, contentWidth);
    }
    if (driverInfo.driverPlate) {
      y = drawRow(doc, "Kennzeichen", driverInfo.driverPlate, y, contentWidth);
    }
    y = drawRow(doc, "Zahlungsart", paymentLabel, y, contentWidth);
    y = drawRow(doc, "Produkt", r.vehicle ?? "—", y, contentWidth);

    if (r.status === "completed") {
      y += 6;
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(
        "Maßgeblich ist der im Fahrzeug angezeigte Taxameter-Endpreis. App-Schätzungen dienen nur der Orientierung.",
        50,
        y,
        { width: contentWidth },
      );
      y += 28;
    }

    y = Math.max(y + 12, 720);
    doc.moveTo(50, y).lineTo(pageWidth - 50, y).strokeColor("#f0f0f0").stroke();
    y += 12;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280").text("Vermittelt über ONRODA", 50, y, {
      align: "center",
      width: contentWidth,
    });
    y += 14;
    doc.font("Helvetica").fontSize(9).fillColor("#9ca3af").text("onroda.de · Deutschland", 50, y, {
      align: "center",
      width: contentWidth,
    });
    if (showSteuerlicherBeleg) {
      y += 14;
      doc.text("Diese Quittung dient als steuerlicher Beleg.", 50, y, { align: "center", width: contentWidth });
    }
    y += 14;
    doc.text("Vielen Dank für Ihre Fahrt!", 50, y, { align: "center", width: contentWidth });

    doc.end();
  });
}

export async function buildCustomerReceiptPdfForRide(
  ride: RideRequest,
  driverInfo: ReceiptDriverInfo = { driverName: null, driverPlate: null },
): Promise<Buffer> {
  const ctx = await resolveCustomerReceiptContext(ride, driverInfo);
  return buildCustomerReceiptPdf(ctx);
}
