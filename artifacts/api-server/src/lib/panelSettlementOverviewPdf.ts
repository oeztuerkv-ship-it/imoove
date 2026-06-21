import PDFDocument from "pdfkit";

import type { PanelSettlementOverviewExportSnapshot } from "../db/panelOverviewSettlementData";

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

function drawRow(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  value: string,
  y: number,
  width: number,
  opts?: { boldValue?: boolean; labelWidth?: number },
): number {
  const labelW = opts?.labelWidth ?? width * 0.52;
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(label, 50, y, { width: labelW });
  doc
    .font(opts?.boldValue === false ? "Helvetica" : "Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text(value, 50 + labelW, y, { width: width - labelW, align: "right" });
  return y + 18;
}

function drawSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151").text(title.toUpperCase(), 50, y);
  return y + 18;
}

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  startY: number,
  tableWidth: number,
): number {
  const rowH = 22;
  const headerH = 24;
  let y = startY;

  doc.roundedRect(50, y, tableWidth, headerH, 4).fill("#f3f4f6");
  let x = 50;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151");
  for (let i = 0; i < headers.length; i += 1) {
    doc.text(headers[i] ?? "", x + 8, y + 7, { width: (colWidths[i] ?? 0) - 16 });
    x += colWidths[i] ?? 0;
  }
  y += headerH;

  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  for (let r = 0; r < rows.length; r += 1) {
    const bg = r % 2 === 0 ? "#ffffff" : "#fafafa";
    doc.rect(50, y, tableWidth, rowH).fill(bg);
    x = 50;
    for (let c = 0; c < rows[r]!.length; c += 1) {
      doc.fillColor("#111827").text(rows[r]![c] ?? "—", x + 8, y + 6, { width: (colWidths[c] ?? 0) - 16 });
      x += colWidths[c] ?? 0;
    }
    doc.moveTo(50, y + rowH).lineTo(50 + tableWidth, y + rowH).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    y += rowH;
  }

  doc.rect(50, startY, tableWidth, y - startY).strokeColor("#e5e7eb").lineWidth(0.75).stroke();
  return y + 10;
}

export function buildPanelSettlementOverviewPdf(input: PanelSettlementOverviewPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { company, snapshot, generatedAt } = input;
    const pageWidth = 595.28;
    const contentWidth = pageWidth - 100;
    const { settlement, paymentStats: ps, completedRides, commissionRate } = snapshot;
    const generatedLabel = generatedAt.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.rect(0, 0, pageWidth, 72).fill("#111827");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text("ABRECHNUNGSÜBERSICHT", 50, 26, {
      align: "center",
      width: contentWidth,
    });
    doc.font("Helvetica").fontSize(10).fillColor("#d1d5db").text("Ihre Abrechnung · ONRODA Partner-Panel", 50, 46, {
      align: "center",
      width: contentWidth,
    });

    let y = 92;
    y = drawSectionTitle(doc, "Mandant", y);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14).text(company.name || "Unternehmen", 50, y, {
      width: contentWidth,
    });
    y += 20;
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    if (company.addressLines.length > 0) {
      for (const line of company.addressLines) {
        doc.text(line, 50, y, { width: contentWidth });
        y += 14;
      }
    } else {
      doc.fillColor("#b45309").text("Adresse noch nicht im Mandantenstamm hinterlegt.", 50, y, { width: contentWidth });
      y += 16;
    }
    if (company.vatId) {
      doc.fillColor("#374151").text(`USt-IdNr.: ${company.vatId}`, 50, y);
      y += 14;
    } else if (company.taxId) {
      doc.fillColor("#374151").text(`Steuernummer: ${company.taxId}`, 50, y);
      y += 14;
    }

    y += 8;
    doc.moveTo(50, y).lineTo(pageWidth - 50, y).strokeColor("#e5e7eb").stroke();
    y += 14;

    y = drawSectionTitle(doc, "Zeitraum", y);
    y = drawRow(doc, "Art", snapshot.periodTitle, y, contentWidth);
    y = drawRow(doc, "Beschreibung", snapshot.periodDescription, y, contentWidth, { boldValue: false });
    y = drawRow(doc, "Erstellt am", `${generatedLabel} (Europe/Berlin)`, y, contentWidth, { boldValue: false });

    y += 6;
    doc.roundedRect(50, y, contentWidth, 108, 8).fillAndStroke("#f0fdf4", "#bbf7d0");
    y += 14;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#065f46").text("Abrechnung (ride_financials)", 62, y);
    y += 20;
    y = drawRow(doc, "Brutto (abgerechnet)", fmtEuro(settlement.grossAmount), y, contentWidth - 24);
    const commissionLabel =
      commissionRate != null
        ? `ONRODA-Provision (${fmtPct(commissionRate)})`
        : "ONRODA-Provision";
    y = drawRow(doc, commissionLabel, fmtEuro(settlement.commissionAmount), y, contentWidth - 24);
    y = drawRow(doc, "Ihr Anteil", fmtEuro(settlement.operatorPayoutAmount), y, contentWidth - 24);
    y = drawRow(doc, "Abgeschlossene Fahrten", String(completedRides), y, contentWidth - 24);
    y += 18;

    y = drawSectionTitle(doc, "Zahlungsarten (abgerechnet)", y);
    y = drawTable(
      doc,
      ["Zahlungsart", "Betrag", "Anzahl"],
      [
        ["Karte", fmtEuro(ps.cardGrossAmount), String(ps.cardRideCount)],
        ["Bar", fmtEuro(ps.cashGrossAmount), String(ps.cashRideCount)],
      ],
      [contentWidth * 0.34, contentWidth * 0.33, contentWidth * 0.33],
      y,
      contentWidth,
    );

    y = drawSectionTitle(doc, "Trinkgeld (informativ)", y);
    y = drawRow(
      doc,
      "Trinkgeld gesamt",
      `${fmtEuro(ps.tipTotal)} · 100 % Fahrer`,
      y,
      contentWidth,
      { boldValue: false },
    );
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(
      "Trinkgeld ist nicht Teil der ONRODA-Abrechnung und geht vollständig an die Fahrerinnen und Fahrer.",
      50,
      y + 2,
      { width: contentWidth },
    );
    y += 28;

    if (ps.pendingPaymentCount > 0 || ps.failedPaymentCount > 0) {
      y = drawSectionTitle(doc, "Kartenzahlungen — Hinweise", y);
      if (ps.pendingPaymentCount > 0) {
        y = drawRow(doc, "Offen / reserviert", String(ps.pendingPaymentCount), y, contentWidth);
      }
      if (ps.failedPaymentCount > 0) {
        y = drawRow(doc, "Fehlgeschlagen", String(ps.failedPaymentCount), y, contentWidth);
      }
      y += 4;
    }

    y += 8;
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(
      "Grundlage: abgeschlossene Fahrten mit Finanz-Snapshot (ride_financials). Der Provisionssatz gilt für neu abgeschlossene Fahrten; Änderungen erfolgen durch den Plattform-Admin.",
      50,
      y,
      { width: contentWidth },
    );
    y += 36;

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
    y += 14;
    doc.text(
      "Diese Übersicht dient der Information für Ihren Steuerberater und ersetzt keine steuerliche Beratung.",
      50,
      y,
      { align: "center", width: contentWidth },
    );

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
