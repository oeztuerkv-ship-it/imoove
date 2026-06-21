import type { CompanyRow } from "../routes/adminApi.types";
import type { RideRequest } from "../domain/rideRequest";
import { findCompanyById } from "../db/adminData";
import { getRideFinancialSnapshotByRideId } from "../db/rideFinancialsData";
import type { ReceiptDriverInfo } from "./receiptDriverInfo";

const DEFAULT_VAT_RATE = 0.19;

export type ReceiptIssuerBlock = {
  name: string;
  addressLines: string[];
  vatId: string | null;
  taxIdLine: string | null;
  complete: boolean;
  missingNote: string | null;
};

export type ReceiptTaxBlock = {
  gross: number;
  net: number;
  vatAmount: number;
  vatRate: number;
  fromFinancials: boolean;
  complete: boolean;
  fallbackNote: string | null;
};

export type CustomerReceiptContext = {
  ride: RideRequest;
  driverInfo: ReceiptDriverInfo;
  issuer: ReceiptIssuerBlock;
  tax: ReceiptTaxBlock;
  showSteuerlicherBeleg: boolean;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  return t || null;
}

function formatEuroHtml(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toFixed(2).replace(".", ",") + " €";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatVatRatePercent(vatRate: number): string {
  const pct = vatRate * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}

export function buildReceiptIssuerFromCompany(company: CompanyRow | null): ReceiptIssuerBlock {
  if (!company) {
    return {
      name: "",
      addressLines: [],
      vatId: null,
      taxIdLine: null,
      complete: false,
      missingNote: "Leistungserbringer konnte dieser Fahrt nicht zugeordnet werden.",
    };
  }

  const name = trimOrNull(company.name) ?? trimOrNull(company.billing_name) ?? "";
  const line1 = trimOrNull(company.address_line1) ?? trimOrNull(company.billing_address_line1);
  const line2 = trimOrNull(company.address_line2) ?? trimOrNull(company.billing_address_line2);
  const postal = trimOrNull(company.postal_code) ?? trimOrNull(company.billing_postal_code);
  const city = trimOrNull(company.city) ?? trimOrNull(company.billing_city);
  const country = trimOrNull(company.country) ?? trimOrNull(company.billing_country) ?? "Deutschland";

  const addressLines: string[] = [];
  if (line1) addressLines.push(line1);
  if (line2) addressLines.push(line2);
  const cityLine = [postal, city].filter(Boolean).join(" ").trim();
  if (cityLine) addressLines.push(cityLine);
  if (country && country.toLowerCase() !== "deutschland" && country.toLowerCase() !== "de") {
    addressLines.push(country);
  }

  const vatId = trimOrNull(company.vat_id);
  const taxId = trimOrNull(company.tax_id);
  const taxIdLine = !vatId && taxId ? `Steuernummer: ${taxId}` : null;

  const complete = Boolean(name && line1 && postal && city);
  let missingNote: string | null = null;
  if (!complete) {
    if (!name) {
      missingNote = "Name des Leistungserbringers ist im System nicht hinterlegt.";
    } else {
      missingNote = "Anschrift des Leistungserbringers ist unvollständig.";
    }
  }

  return {
    name,
    addressLines,
    vatId,
    taxIdLine,
    complete,
    missingNote,
  };
}

export function buildReceiptTaxBlock(
  gross: number,
  financials: {
    netAmount: number;
    vatAmount: number;
    vatRate: number;
  } | null,
): ReceiptTaxBlock {
  const safeGross = roundMoney(Math.max(0, gross));
  if (safeGross <= 0) {
    return {
      gross: 0,
      net: 0,
      vatAmount: 0,
      vatRate: DEFAULT_VAT_RATE,
      fromFinancials: false,
      complete: false,
      fallbackNote: "Kein Endpreis für die MwSt-Aufteilung verfügbar.",
    };
  }

  if (
    financials &&
    Number.isFinite(financials.netAmount) &&
    Number.isFinite(financials.vatAmount) &&
    Number.isFinite(financials.vatRate) &&
    financials.vatRate >= 0
  ) {
    return {
      gross: safeGross,
      net: roundMoney(financials.netAmount),
      vatAmount: roundMoney(financials.vatAmount),
      vatRate: financials.vatRate,
      fromFinancials: true,
      complete: true,
      fallbackNote: null,
    };
  }

  const vatRate = DEFAULT_VAT_RATE;
  const net = roundMoney(safeGross / (1 + vatRate));
  const vatAmount = roundMoney(safeGross - net);
  return {
    gross: safeGross,
    net,
    vatAmount,
    vatRate,
    fromFinancials: false,
    complete: false,
    fallbackNote:
      "MwSt-Aufteilung vorläufig (Standardsteuersatz 19 %). Endgültige Versteuerung durch den Leistungserbringer.",
  };
}

export function receiptShowsSteuerlicherBeleg(issuer: ReceiptIssuerBlock, tax: ReceiptTaxBlock): boolean {
  return issuer.complete && tax.complete && tax.gross > 0;
}

/** Kunden-Quittung: nur Taxameter-`finalFare` — kein Buchungs-Schätzpreis. */
export function customerReceiptGrossEur(ride: RideRequest): number {
  if (ride.status !== "completed") return 0;
  const finalFare = ride.finalFare;
  if (finalFare == null || !Number.isFinite(Number(finalFare))) return 0;
  return roundMoney(Math.max(0, Number(finalFare)));
}

export async function resolveCustomerReceiptContext(
  ride: RideRequest,
  driverInfo: ReceiptDriverInfo = { driverName: null, driverPlate: null },
): Promise<CustomerReceiptContext> {
  const companyId = trimOrNull(ride.companyId ?? null);
  const company = companyId ? await findCompanyById(companyId) : null;
  const issuer = buildReceiptIssuerFromCompany(company);

  const gross = effectiveTaxiGrossEur(ride);
  const financialRow = await getRideFinancialSnapshotByRideId(ride.id);
  const tax = buildReceiptTaxBlock(
    gross,
    financialRow
      ? {
          netAmount: Number(financialRow.netAmount),
          vatAmount: Number(financialRow.vatAmount),
          vatRate: Number(financialRow.vatRate),
        }
      : null,
  );

  return {
    ride,
    driverInfo,
    issuer,
    tax,
    showSteuerlicherBeleg: receiptShowsSteuerlicherBeleg(issuer, tax),
  };
}

function paymentLabelForRide(r: RideRequest): string {
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

export function buildCustomerReceiptHtml(ctx: CustomerReceiptContext): string {
  const { ride: r, driverInfo, issuer, tax, showSteuerlicherBeleg } = ctx;
  const date = new Date(r.createdAt);
  const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const amount = tax.gross;
  const tipAmount =
    r.tipAmount != null && Number.isFinite(Number(r.tipAmount)) ? Math.max(0, Number(r.tipAmount)) : 0;
  const rideNr = String(r.id).slice(0, 8).toUpperCase();
  const paymentLabel = paymentLabelForRide(r);

  const issuerNameHtml = issuer.name
    ? escapeHtml(issuer.name)
    : `<span class="muted">Leistungserbringer nicht hinterlegt</span>`;
  const issuerAddressHtml = issuer.addressLines.length
    ? issuer.addressLines.map((line) => escapeHtml(line)).join("<br/>")
    : issuer.missingNote
      ? `<span class="issuer-note">${escapeHtml(issuer.missingNote)}</span>`
      : "";
  const vatIdHtml = issuer.vatId
    ? `<div class="issuer-tax">USt-IdNr.: ${escapeHtml(issuer.vatId)}</div>`
    : issuer.taxIdLine
      ? `<div class="issuer-tax">${escapeHtml(issuer.taxIdLine)}</div>`
      : "";

  const taxRowsHtml =
    amount > 0
      ? `
      <div class="tax-block">
        <div class="row"><div class="k">Netto</div><div class="v">${formatEuroHtml(tax.net)}</div></div>
        <div class="row"><div class="k">MwSt (${formatVatRatePercent(tax.vatRate)} %)</div><div class="v">${formatEuroHtml(tax.vatAmount)}</div></div>
        <div class="row tax-gross"><div class="k">Brutto (Taxameter)</div><div class="v">${formatEuroHtml(tax.gross)}</div></div>
        ${tax.fallbackNote ? `<p class="tax-note">${escapeHtml(tax.fallbackNote)}</p>` : ""}
      </div>`
      : "";

  const tipRowsHtml =
    tipAmount > 0.005
      ? `
      <div class="row"><div class="k">Trinkgeld</div><div class="v">${formatEuroHtml(tipAmount)}</div></div>
      <div class="row tax-gross"><div class="k">Gesamt (Fahrt + Trinkgeld)</div><div class="v">${formatEuroHtml(amount + tipAmount)}</div></div>`
      : "";

  const footerBelegLine = showSteuerlicherBeleg
    ? "Diese Quittung dient als steuerlicher Beleg.<br/>"
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quittung #${escapeHtml(rideNr)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #111; padding: 32px 16px; }
    .receipt { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 20px rgba(0,0,0,0.10); overflow: hidden; }
    .header { background: #111827; color: #fff; padding: 22px 26px 18px; text-align: center; }
    .receipt-title { font-size: 12px; font-weight: 600; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
    .receipt-id { font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .issuer { padding: 18px 26px 8px; border-bottom: 1px solid #f0f0f0; }
    .issuer-label { font-size: 10px; color: #6b7280; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
    .issuer-name { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 6px; }
    .issuer-address { font-size: 12px; color: #374151; line-height: 1.55; }
    .issuer-tax { font-size: 12px; color: #374151; margin-top: 8px; font-weight: 600; }
    .issuer-note { font-size: 12px; color: #b45309; line-height: 1.5; }
    .body { padding: 18px 26px 22px; }
    .row { display:flex; justify-content:space-between; gap:12px; margin-bottom: 10px; }
    .k { color:#6b7280; font-size: 12px; font-weight: 600; }
    .v { color:#111827; font-size: 12px; font-weight: 600; text-align:right; }
    .route { margin-top: 14px; background:#f9fafb; border:1px solid #eef2f7; border-radius: 12px; padding: 14px; }
    .route h3 { font-size: 12px; color:#6b7280; letter-spacing:0.08em; text-transform:uppercase; margin-bottom: 10px; }
    .route .pt { font-size: 13px; font-weight: 600; margin-bottom: 8px; color:#111827; }
    .muted { color:#6b7280; font-size: 12px; font-weight: 500; }
    .tax-block { margin-top: 14px; background:#f9fafb; border:1px solid #eef2f7; border-radius: 12px; padding: 14px; }
    .tax-gross .v { font-size: 14px; font-weight: 800; }
    .tax-note { margin-top: 10px; font-size: 11px; color: #b45309; line-height: 1.5; }
    .footer { text-align:center; padding: 16px 26px; background:#fafafa; border-top:1px solid #f0f0f0; font-size: 11px; color:#9ca3af; line-height: 1.6; }
    .footer-broker { color: #6b7280; font-weight: 600; }
    @media print { body { background:#fff; padding:0; } .receipt { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="receipt-title">Fahrtquittung</div>
      <div class="receipt-id">Nr. ${escapeHtml(rideNr)}</div>
    </div>
    <div class="issuer">
      <div class="issuer-label">Leistungserbringer</div>
      <div class="issuer-name">${issuerNameHtml}</div>
      ${issuerAddressHtml ? `<div class="issuer-address">${issuerAddressHtml}</div>` : ""}
      ${vatIdHtml}
    </div>
    <div class="body">
      <div class="row"><div><div class="k">Datum</div><div class="v">${escapeHtml(dateStr)}</div></div><div><div class="k">Uhrzeit</div><div class="v">${escapeHtml(timeStr)} Uhr</div></div></div>
      ${taxRowsHtml}
      ${tipRowsHtml}
      <div class="route">
        <h3>Route</h3>
        <div class="muted">Abfahrt</div>
        <div class="pt">${escapeHtml(r.from ?? "—")}</div>
        <div class="muted">Ziel</div>
        <div class="pt">${escapeHtml(r.to ?? "—")}</div>
      </div>
      <div style="margin-top: 14px;">
        <div class="row"><div class="k">${r.actualDistanceKm != null ? "Gefahrene Strecke" : "Geplante Strecke"}</div><div class="v">${escapeHtml(String((r.actualDistanceKm ?? r.distanceKm ?? 0).toFixed(1)))} km</div></div>
        ${r.actualDurationMinutes != null ? `<div class="row"><div class="k">Fahrtdauer</div><div class="v">${escapeHtml(String(r.actualDurationMinutes))} Min</div></div>` : ""}
        ${driverInfo.driverName ? `<div class="row"><div class="k">Fahrer*in</div><div class="v">${escapeHtml(driverInfo.driverName)}</div></div>` : ""}
        ${driverInfo.driverPlate ? `<div class="row"><div class="k">Kennzeichen</div><div class="v">${escapeHtml(driverInfo.driverPlate)}</div></div>` : ""}
        <div class="row"><div class="k">Zahlungsart</div><div class="v">${escapeHtml(paymentLabel)}</div></div>
        <div class="row"><div class="k">Produkt</div><div class="v">${escapeHtml(r.vehicle ?? "—")}</div></div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-broker">Vermittelt über ONRODA</span><br/>
      onroda.de · Deutschland<br/>
      ${footerBelegLine}
      Vielen Dank für Ihre Fahrt!
    </div>
  </div>
  <script>
    window.addEventListener('load', function() { setTimeout(function() { try { window.print(); } catch(e) {} }, 250); });
  <\/script>
</body>
</html>`;
}

export async function buildCustomerReceiptHtmlForRide(
  ride: RideRequest,
  driverInfo: ReceiptDriverInfo = { driverName: null, driverPlate: null },
): Promise<string> {
  const ctx = await resolveCustomerReceiptContext(ride, driverInfo);
  return buildCustomerReceiptHtml(ctx);
}
