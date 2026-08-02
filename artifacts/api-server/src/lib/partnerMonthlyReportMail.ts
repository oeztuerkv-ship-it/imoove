import { escapeHtmlMail } from "./onrodaSmtpMail.js";
import { resolvePartnerPanelUrl } from "./invoiceReminderMail.js";

export type MonthlyReportInvoiceLine = {
  invoiceNumber: string;
  kindLabel: string;
  totalGross: number;
  dueDate: string | null;
  statusLabel: string;
};

export type MonthlyReportTaxiKpis = {
  grossAmount: number;
  commissionAmount: number;
  operatorPayoutAmount: number;
};

export type PartnerMonthlyReportMailInput = {
  companyName: string;
  periodYm: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  openInvoices: MonthlyReportInvoiceLine[];
  openKrankenInvoices: MonthlyReportInvoiceLine[];
  /** Nur Taxi / Cash-Card-Netting. */
  taxiKpis: MonthlyReportTaxiKpis | null;
};

function fmtDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoneyEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

function linesToTextTable(rows: MonthlyReportInvoiceLine[]): string[] {
  if (!rows.length) return ["  (keine)"];
  return rows.map(
    (r) =>
      `  • ${r.invoiceNumber} · ${r.kindLabel} · ${fmtMoneyEur(r.totalGross)} · Fällig ${fmtDateDe(r.dueDate)} · ${r.statusLabel}`,
  );
}

function linesToHtmlRows(rows: MonthlyReportInvoiceLine[]): string {
  if (!rows.length) {
    return `<tr><td colspan="5" style="padding:8px;color:#666;">Keine offenen Posten</td></tr>`;
  }
  return rows
    .map(
      (r) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtmlMail(r.invoiceNumber)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtmlMail(r.kindLabel)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtmlMail(fmtMoneyEur(r.totalGross))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtmlMail(fmtDateDe(r.dueDate))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtmlMail(r.statusLabel)}</td>
      </tr>`,
    )
    .join("");
}

export function buildPartnerMonthlyReportMail(
  input: PartnerMonthlyReportMailInput,
): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || "Ihr Unternehmen";
  const panelUrl = resolvePartnerPanelUrl();
  const financeUrl = `${panelUrl}/`; // Panel-Root; Partner navigiert zu Finanzen
  const subject = `ONRODA Monatsüberblick ${input.periodLabel} — offene Posten & Vormonat`;

  const textParts = [
    `Guten Tag,`,
    "",
    `hier Ihr automatischer Monatsüberblick für ${company}.`,
    `Berichtszeitraum (Vormonat): ${input.periodLabel} (${fmtDateDe(input.periodStart)} – ${fmtDateDe(input.periodEnd)}).`,
    "",
    "Offene Rechnungen (Stand zum Versandzeitpunkt):",
    ...linesToTextTable(input.openInvoices),
    "",
    "Offene Krankenfahrten-Sammelrechnungen:",
    ...linesToTextTable(input.openKrankenInvoices),
  ];

  if (input.taxiKpis) {
    textParts.push(
      "",
      "Einnahmen / Ausgaben Vormonat (Taxi Cash/Card-Netting):",
      `  Brutto: ${fmtMoneyEur(input.taxiKpis.grossAmount)}`,
      `  ONRODA-Provision: ${fmtMoneyEur(input.taxiKpis.commissionAmount)}`,
      `  Ihr Anteil: ${fmtMoneyEur(input.taxiKpis.operatorPayoutAmount)}`,
    );
  }

  textParts.push(
    "",
    `Details im Partner-Portal: ${financeUrl}`,
    "",
    "Mit freundlichen Grüßen",
    "Ihr ONRODA-Team",
  );

  const text = textParts.join("\n");

  const kpiHtml = input.taxiKpis
    ? `<h3 style="margin:24px 0 8px;font-size:16px;color:#111;">Vormonat Cash/Card-Netting</h3>
      <ul style="margin:0 0 16px;padding-left:18px;color:#333;line-height:1.6;">
        <li>Brutto: <strong>${escapeHtmlMail(fmtMoneyEur(input.taxiKpis.grossAmount))}</strong></li>
        <li>ONRODA-Provision: <strong>${escapeHtmlMail(fmtMoneyEur(input.taxiKpis.commissionAmount))}</strong></li>
        <li>Ihr Anteil: <strong>${escapeHtmlMail(fmtMoneyEur(input.taxiKpis.operatorPayoutAmount))}</strong></li>
      </ul>`
    : "";

  const tableHead = `<tr style="background:#f5f5f5;text-align:left;">
    <th style="padding:8px;">Nummer</th><th style="padding:8px;">Art</th>
    <th style="padding:8px;text-align:right;">Betrag</th>
    <th style="padding:8px;">Fällig</th><th style="padding:8px;">Status</th>
  </tr>`;

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:640px;margin:auto;background:white;padding:30px;border-radius:10px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:0.02em;line-height:1.2;">
          <span style="color:#e30613;">On</span><span style="color:#111111;">roda</span>
        </div>
      </div>
      <h2 style="text-align:center;margin:0 0 16px;font-size:20px;color:#111;">Monatsüberblick ${escapeHtmlMail(input.periodLabel)}</h2>
      <p style="margin:0 0 12px;line-height:1.55;color:#333;">Guten Tag,</p>
      <p style="margin:0 0 16px;line-height:1.55;color:#333;">
        hier Ihr automatischer Überblick für <strong>${escapeHtmlMail(company)}</strong>
        (Vormonat ${escapeHtmlMail(fmtDateDe(input.periodStart))} – ${escapeHtmlMail(fmtDateDe(input.periodEnd))}).
        Offene Posten entsprechen dem <strong>aktuellen Stand zum Versandzeitpunkt</strong>.
      </p>
      <h3 style="margin:20px 0 8px;font-size:16px;color:#111;">Offene Rechnungen</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333;">${tableHead}${linesToHtmlRows(input.openInvoices)}</table>
      <h3 style="margin:24px 0 8px;font-size:16px;color:#111;">Offene Krankenfahrten-Sammelrechnungen</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333;">${tableHead}${linesToHtmlRows(input.openKrankenInvoices)}</table>
      ${kpiHtml}
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${escapeHtmlMail(financeUrl)}"
           style="display:inline-block;background:#e30613;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:6px;font-weight:bold;">
          Zum Partner-Portal
        </a>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#888;line-height:1.45;">
        Diese E-Mail wurde automatisch erzeugt. Bei Rückfragen antworten Sie gerne.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, text, html };
}
