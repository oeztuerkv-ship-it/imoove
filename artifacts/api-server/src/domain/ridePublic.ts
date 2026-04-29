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
          transport_document_required: (partnerMeta as Record<string, unknown>).transport_document_required !== false,
          transport_document_status:
            (partnerMeta as Record<string, unknown>).transport_document_status ?? "missing",
          signature_required: (partnerMeta as Record<string, unknown>).signature_required === true,
          signature_done: (partnerMeta as Record<string, unknown>).signature_done === true,
          qr_required: (partnerMeta as Record<string, unknown>).qr_required !== false,
          qr_done: (partnerMeta as Record<string, unknown>).qr_done === true,
          qr_verified_at: (partnerMeta as Record<string, unknown>).qr_verified_at ?? null,
          qr_verified_by_driver_id: (partnerMeta as Record<string, unknown>).qr_verified_by_driver_id ?? null,
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

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function medicalStepStatus(meta: Record<string, unknown> | null) {
  const qrDone = meta?.qr_done === true;
  const signatureDone = meta?.signature_done === true;
  const documentPresent =
    meta?.transport_document_status === "uploaded" ||
    (typeof meta?.transport_document_file_key === "string" &&
      meta.transport_document_file_key.trim().length > 0);
  return {
    qrConfirmed: qrDone,
    documentPresent,
    signatureDone,
  };
}

function withoutBillingFields(r: RideRequest): RideRequest {
  const {
    estimatedFare: _estimatedFare,
    finalFare: _finalFare,
    billingReference: _billingReference,
    tariffSnapshot: _tariffSnapshot,
    ...rest
  } = r;
  return {
    ...rest,
    // Fahrer-/Kundenansicht bekommt keine Abrechnungsdetails.
    estimatedFare: 0,
    finalFare: null,
    billingReference: null,
    tariffSnapshot: null,
  } as RideRequest;
}

/** Kunde: nur medizinische Schritt-Status, keine internen Prüf-/Billing-Daten. */
export function toCustomerRideView(r: RideRequest): RideRequest {
  const base = stripPartnerOnlyRideFields(withoutBillingFields(r));
  const {
    companyId: _companyId,
    createdByPanelUserId: _createdByPanelUserId,
    accessCodeId: _accessCodeId,
    accessCodeNormalizedSnapshot: _accessCodeNormalizedSnapshot,
    accessCodeSummary: _accessCodeSummary,
    accessCodeTripOutcome: _accessCodeTripOutcome,
    accessCodeDefinitionState: _accessCodeDefinitionState,
    ...publicBase
  } = base;
  const meta = asRecord(base.partnerBookingMeta);
  if (!meta || meta.medical_ride !== true) return publicBase as RideRequest;
  return {
    ...publicBase,
    partnerBookingMeta: {
      medical_ride: true,
      stepStatus: medicalStepStatus(meta),
    },
  } as RideRequest;
}

/** Fahrer: Schrittstatus sichtbar, aber keine Abrechnungsdetails. */
export function toDriverRideView(r: RideRequest): RideRequest {
  const base = stripPartnerOnlyRideFields(withoutBillingFields(r));
  const meta = asRecord(base.partnerBookingMeta);
  if (!meta || meta.medical_ride !== true) return base;
  return {
    ...base,
    partnerBookingMeta: {
      medical_ride: true,
      stepStatus: medicalStepStatus(meta),
    },
  } as RideRequest;
}

/** Partner: nur eigene Fahrten (Route-Filter), plus Validierungs-Log und Billing-Status. */
export function toPartnerRideView(r: RideRequest): RideRequest {
  const meta = asRecord(r.partnerBookingMeta);
  if (!meta || meta.medical_ride !== true) return r;
  const validationLog = [
    meta.qr_verified_at
      ? {
          type: "qr_verified",
          at: meta.qr_verified_at,
          by: meta.qr_verified_by_driver_id ?? null,
        }
      : null,
    meta.transport_document_uploaded_at
      ? {
          type: "transport_document_uploaded",
          at: meta.transport_document_uploaded_at,
          by: meta.transport_document_uploaded_by_driver_id ?? null,
        }
      : null,
    meta.signature_signed_at
      ? {
          type: "signature_captured",
          at: meta.signature_signed_at,
          by: meta.signature_signed_by_driver_id ?? null,
        }
      : null,
  ].filter(Boolean);
  return {
    ...r,
    partnerBookingMeta: {
      ...meta,
      validationLog,
      billingStatus: {
        ready: meta.billing_ready === true,
        missingReasons: Array.isArray(meta.billing_missing_reasons)
          ? meta.billing_missing_reasons
          : [],
      },
      exportEligible: meta.billing_ready === true,
    },
  } as RideRequest;
}
