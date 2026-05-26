import { writeFileSync } from "node:fs";
import { buildPartnerMonthlyInvoicePdf } from "../lib/invoicePdfServer.js";

async function main() {
  const pdf = await buildPartnerMonthlyInvoicePdf({
    invoiceNumber: "ONR-HOT-2026-04-001",
    statusLabel: "Offen",
    issueDate: "2026-04-30",
    dueDate: "2026-05-14",
    periodFrom: "2026-04-01",
    periodTo: "2026-04-30",
    recipientName: "Hotel Beispiel GmbH",
    recipientLines: ["Musterstraße 1", "70173 Stuttgart", "Deutschland"],
    segmentLabel: "Hotel / Gutschein-Fahrten",
    items: [
      {
        description: "Transfer Flughafen Stuttgart",
        detail: "02.04.2026 · Terminal 1 → Hotel · Code: HTL-8842",
        lineGross: 34.8,
        quantity: 1,
        unitNet: 29.24,
        vatRate: 19,
        lineNet: 29.24,
        lineVat: 5.56,
      },
      {
        description: "City Transfer Messe",
        detail: "08.04.2026 · Messe → Innenstadt",
        lineGross: 28.2,
        quantity: 1,
        unitNet: 23.7,
        vatRate: 19,
        lineNet: 23.7,
        lineVat: 4.5,
      },
    ],
    subtotalNet: 52.94,
    vatTotal: 10.06,
    totalGross: 63.0,
    taxRatePercent: 19,
    notes: "Vielen Dank für die Zusammenarbeit.",
    paymentReference: "ONRODA Hotel Beispiel GmbH 2026-04 ONR-HOT-2026-04-001",
  });

  const out = process.argv[2] ?? "/tmp/onroda-invoice-sample.pdf";
  writeFileSync(out, pdf);
  console.log(`OK: ${out} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
