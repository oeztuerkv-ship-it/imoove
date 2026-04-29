export type MedicalBillingReadinessResult = {
  billingReady: boolean;
  missingReasons: string[];
};

function normalizeStatus(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export function calculateMedicalBillingReadiness(meta: Record<string, unknown>): MedicalBillingReadinessResult {
  const missing: string[] = [];
  const approval = normalizeStatus(meta.approval_status);
  const doc = normalizeStatus(meta.transport_document_status);
  const insurance = typeof meta.insurance_name === "string" ? meta.insurance_name.trim() : "";
  const costCenter = typeof meta.cost_center === "string" ? meta.cost_center.trim() : "";
  const signatureRequired = meta.signature_required === true;
  const signatureDone = meta.signature_done === true;
  const qrRequired = meta.qr_required !== false;
  const qrDone = meta.qr_done === true;
  const transportDocRequired = meta.transport_document_required !== false;

  if (approval !== "approved") missing.push("missing_approval");
  if (qrRequired && !qrDone) missing.push("missing_qr_verification");
  if (transportDocRequired && doc !== "uploaded" && doc !== "provided") missing.push("missing_transport_document");
  if (signatureRequired && !signatureDone) missing.push("missing_signature");
  if (!insurance) missing.push("missing_insurance");
  if (!costCenter) missing.push("missing_cost_center");

  return { billingReady: missing.length === 0, missingReasons: missing };
}

