import type { RideRequest } from "../domain/rideRequest";

/**
 * Eingefrorener Kontext bei Medical-Panel-Rechnungserzeugung (partner_booking_meta.invoice_immutable_context).
 * Keine Diagnosen — nur abrechnungs- und fahrtrelevante Reduktion bestehender Ride-/Meta-Felder.
 */
export function buildMedicalInvoiceImmutableContext(
  ride: RideRequest,
  input: {
    invoiceNumber: string;
    grossEur: number;
    commissionRate: number;
    commissionAmountEur: number;
    payoutAmountEur: number;
    invoicePdfFileKey: string;
    capturedAtIso: string;
  },
): Record<string, unknown> {
  const pm =
    ride.partnerBookingMeta && typeof ride.partnerBookingMeta === "object"
      ? (ride.partnerBookingMeta as Record<string, unknown>)
      : {};

  const tariff = ride.tariffSnapshot;
  const tariffReduced =
    tariff && typeof tariff === "object"
      ? {
          engineSchemaVersion:
            typeof (tariff as { engineSchemaVersion?: unknown }).engineSchemaVersion === "number"
              ? (tariff as { engineSchemaVersion: number }).engineSchemaVersion
              : null,
          finalPriceEur:
            typeof (tariff as { finalPriceEur?: unknown }).finalPriceEur === "number"
              ? (tariff as { finalPriceEur: number }).finalPriceEur
              : null,
          pricingModeHint: ride.pricingMode ?? null,
        }
      : null;

  return {
    schemaVersion: 1,
    purpose: "partner_medical_invoice_pdf",
    capturedAtIso: input.capturedAtIso,
    rideId: ride.id,
    companyId: ride.companyId ?? null,
    rideStatusAtInvoice: ride.status,
    route: {
      fromLabel: ride.from,
      toLabel: ride.to,
      fromFull: ride.fromFull,
      toFull: ride.toFull,
      distanceKm: ride.distanceKm,
      durationMinutes: ride.durationMinutes,
    },
    customer: { displayName: ride.customerName },
    money: {
      estimatedFare: ride.estimatedFare,
      finalFare: ride.finalFare ?? null,
      invoicedGrossEur: input.grossEur,
      commissionRate: input.commissionRate,
      commissionAmountEur: input.commissionAmountEur,
      partnerPayoutEur: input.payoutAmountEur,
    },
    tariffSnapshotReduced: tariffReduced,
    medicalWorkflow: {
      billing_ready: pm.billing_ready === true,
      qr_done: pm.qr_done === true,
      signature_done: pm.signature_done === true,
      transport_document_status:
        typeof pm.transport_document_status === "string" ? pm.transport_document_status : null,
      transport_document_file_key:
        typeof pm.transport_document_file_key === "string" ? pm.transport_document_file_key : null,
      signature_file_key: typeof pm.signature_file_key === "string" ? pm.signature_file_key : null,
      insurance_name: typeof pm.insurance_name === "string" ? pm.insurance_name : "",
      cost_center: typeof pm.cost_center === "string" ? pm.cost_center : "",
    },
    invoice: {
      number: input.invoiceNumber,
      pdfFileKey: input.invoicePdfFileKey,
    },
  };
}
