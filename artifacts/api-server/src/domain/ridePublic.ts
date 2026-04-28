import type { RideRequest } from "./rideRequest";

/** Partner-/Audit-Felder, die nicht in den gemeinsamen Fahrten-Poll (`GET /rides`) gehören. */
export function stripPartnerOnlyRideFields(r: RideRequest): RideRequest {
  const partnerMeta = r.partnerBookingMeta;
  const driverVisibleMedicalMeta =
    partnerMeta && typeof partnerMeta === "object" && (partnerMeta as Record<string, unknown>).medical_ride === true
      ? {
          medical_ride: true,
          approval_status: (partnerMeta as Record<string, unknown>).approval_status ?? "pending",
          payer_kind: (partnerMeta as Record<string, unknown>).payer_kind ?? "insurance",
          insurance_name: (partnerMeta as Record<string, unknown>).insurance_name ?? "",
          cost_center: (partnerMeta as Record<string, unknown>).cost_center ?? "",
          transport_document_status:
            (partnerMeta as Record<string, unknown>).transport_document_status ?? "missing",
          signature_required: (partnerMeta as Record<string, unknown>).signature_required === true,
          signature_done: (partnerMeta as Record<string, unknown>).signature_done === true,
          qr_required: (partnerMeta as Record<string, unknown>).qr_required === true,
          qr_done: (partnerMeta as Record<string, unknown>).qr_done === true,
          billing_ready: (partnerMeta as Record<string, unknown>).billing_ready === true,
          billing_missing_reasons: Array.isArray(
            (partnerMeta as Record<string, unknown>).billing_missing_reasons,
          )
            ? (partnerMeta as Record<string, unknown>).billing_missing_reasons
            : [],
        }
      : null;
  const {
    accessCodeNormalizedSnapshot: _snap,
    accessCodeTripOutcome: _to,
    accessCodeDefinitionState: _ds,
    partnerBookingMeta: _pb,
    ...rest
  } = r;
  return {
    ...rest,
    partnerBookingMeta: driverVisibleMedicalMeta,
  } as RideRequest;
}
