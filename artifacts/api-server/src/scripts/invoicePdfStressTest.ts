/**
 * PDF-Layout Smoke: Mehrseiten, Umlaute, lange Texte, deutsche Formate, Footer.
 * Ausführung: pnpm --filter @workspace/api-server run test:invoice-pdf-stress
 */
import { writeFileSync } from "node:fs";
import {
  renderPartnerInvoicePdfWithMeta,
  roundMoneyEur,
  type PartnerInvoicePdfLineItem,
} from "../lib/invoice/partnerInvoicePdf.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function countPdfPages(buf: Buffer): number {
  const text = buf.toString("latin1");
  const m = text.match(/\/Type\s*\/Page\b/g);
  return m ? m.length : 0;
}

function buildStressItems(count: number): PartnerInvoicePdfLineItem[] {
  const items: PartnerInvoicePdfLineItem[] = [];
  let netSum = 0;
  let vatSum = 0;
  for (let i = 0; i < count; i += 1) {
    const lineNet = roundMoneyEur(12.5 + (i % 7) * 3.33);
    const lineVat = roundMoneyEur(lineNet * 0.19);
    const lineGross = roundMoneyEur(lineNet + lineVat);
    netSum = roundMoneyEur(netSum + lineNet);
    vatSum = roundMoneyEur(vatSum + lineVat);
    items.push({
      position: i + 1,
      description: `Fahrt ${i + 1}: Concierge-Transfer mit Gepäck & Wartung`,
      subline: `15.${String((i % 28) + 1).padStart(2, "0")}.2026 · Flughafen Stuttgart Terminal 3 → Hotel Königstraße Premium Residenz & Spa · 42,8 km · Code: HTL-ÜÄÖ-${1000 + i}`,
      quantity: 1,
      unitNet: lineNet,
      vatRate: 19,
      lineNet,
      lineVat,
      lineGross,
    });
  }
  return items;
}

async function main() {
  const items = buildStressItems(32);
  const subtotalNet = roundMoneyEur(items.reduce((s, i) => s + i.lineNet, 0));
  const vatTotal = roundMoneyEur(items.reduce((s, i) => s + i.lineVat, 0));
  const totalGross = roundMoneyEur(subtotalNet + vatTotal);

  const { buffer, pageCount } = await renderPartnerInvoicePdfWithMeta({
    invoiceNumber: "ONR-2026-STRESS-001",
    statusLabel: "Überfällig",
    issueDate: "2026-04-30",
    dueDate: "2026-05-14",
    periodFrom: "2026-04-01",
    periodTo: "2026-04-30",
    recipientName:
      "Hotel Königliche Residenz & Spa am Schlossgarten Gesellschaft mit beschränkter Haftung",
    recipientLines: [
      "Abteilung Concierge / Accounts Payable — Zentrale Buchhaltung",
      "Königstraße 123 — Hinterhaus — 70173 Stuttgart",
      "Deutschland",
    ],
    segmentLabel: "Hotel / Gutschein · Krankenfahrt-ähnliche Abrechnung",
    items,
    subtotalNet,
    vatTotal,
    totalGross,
    taxRatePercent: 19,
    notes: "Bitte überweisen mit Verwendungszweck. Vielen Dank für die Zusammenarbeit — Grüße aus Leinfelden-Echterdingen.",
    paymentReference: "ONR-2026-STRESS-001", // = invoice_number (Verwendungszweck)
  });

  const out = process.argv[2] ?? "/tmp/onroda-invoice-stress.pdf";
  writeFileSync(out, buffer);

  const parsedPages = countPdfPages(buffer);
  assert(pageCount >= 2, `expected >=2 pages from renderer, got ${pageCount}`);
  assert(parsedPages >= 2, `expected >=2 pages in PDF bytes, got ${parsedPages}`);
  assert(buffer.length > 8000, `PDF too small: ${buffer.length} bytes`);
  assert(buffer.subarray(0, 5).toString() === "%PDF-", "not a PDF file");

  // Inhalt ist Flate-compressed — strukturelle Checks (Seiten, Größe) reichen für CI-Smoke.
  console.log(
    `OK: stress PDF ${out} — ${buffer.length} bytes, pages=${pageCount} (parsed=${parsedPages}), items=${items.length}`,
  );
  console.log(`OK: totals net=${subtotalNet} vat=${vatTotal} gross=${totalGross} (de-DE rounded)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
