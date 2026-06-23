import { writeFileSync } from "node:fs";
import { buildCustomerReceiptHtmlForRide } from "../lib/customerReceipt.js";
import { buildCustomerReceiptPdfForRide } from "../lib/customerReceiptPdf.js";
import type { RideRequest } from "../domain/rideRequest.js";

const ride: RideRequest = {
  id: "REQ-selftest-001",
  createdAt: new Date().toISOString(),
  status: "completed",
  customerName: "Test Kunde",
  from: "Esslingen Hbf",
  fromFull: "Esslingen (Neckar) Hbf",
  to: "Stuttgart Mitte",
  toFull: "Stuttgart Mitte",
  distanceKm: 12.4,
  durationMinutes: 18,
  estimatedFare: 28,
  finalFare: 24.5,
  vehicle: "Standard",
  paymentMethod: "card",
  companyId: null,
  driverId: null,
  rejectedBy: [],
  rideKind: "standard",
  payerKind: "passenger",
  authorizationSource: "app",
  accessCodeId: null,
  pricingMode: "taxi_tariff",
};

async function main() {
  const html = await buildCustomerReceiptHtmlForRide(ride, { driverName: null, driverPlate: null });
  if (!html.includes("Fahrtquittung")) throw new Error("html_missing_title");
  const pdf = await buildCustomerReceiptPdfForRide(ride, { driverName: null, driverPlate: null });
  if (pdf.length < 500) throw new Error(`pdf_too_small:${pdf.length}`);

  const stringKmRide = { ...ride, id: "REQ-selftest-002", distanceKm: "9.8" as unknown as number };
  await buildCustomerReceiptHtmlForRide(stringKmRide, { driverName: null, driverPlate: null });
  await buildCustomerReceiptPdfForRide(stringKmRide, { driverName: null, driverPlate: null });

  writeFileSync("/tmp/onroda-receipt-selftest.pdf", pdf);
  console.log("ok", { htmlBytes: html.length, pdfBytes: pdf.length });
}

main().catch((err) => {
  console.error("customerReceiptSelftest failed:", err);
  process.exit(1);
});
