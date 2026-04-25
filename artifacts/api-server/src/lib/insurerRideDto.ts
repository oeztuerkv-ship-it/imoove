/**
 * Krankenkassen-Modus: festes, minimiertes Datenprodukt.
 * Niemals vollständige Ride-Row oder Partner-/Patientenrohdaten durchreichen.
 */

export type InsurerProofFlags = {
  hasGpsPoints: boolean;
  hasChronology: boolean;
  hasSignatureOrConfirmation: boolean;
  hasApprovalReference: boolean;
};

export type InsurerRideListItem = {
  rideId: string;
  companyId: string | null;
  companyName: string;
  /** Nur technische Beförderer-Fahrer-ID, kein Personenname. */
  driverId: string | null;
  /** Kennzeichen o. Fahrzeug-Kurztext, keine sensiblen Flottendetails. */
  vehiclePlate: string;
  /** Referenz-Zeit für die Liste (geplant bzw. Buchungszeit). */
  referenceTime: string;
  fromPostalCode: string | null;
  fromLocality: string | null;
  toPostalCode: string | null;
  toLocality: string | null;
  amountGross: number;
  rideStatus: string;
  financialBillingStatus: string | null;
  financialSettlementStatus: string | null;
  rideKind: string;
  payerKind: string;
  /** Nur pseudonym / technische ID — kein Klarnamen. */
  passengerPseudonymId: string | null;
  /** Kein medizinischer Inhalt. */
  billingReference: string | null;
  proof: InsurerProofFlags;
  /** Letzter Export-Batch, in dem die Fahrt vorkommt (Kennung). */
  lastExportBatchId: string | null;
};

export type InsurerRideDetail = InsurerRideListItem & {
  distanceKm: number;
  durationMinutes: number;
  pricingMode: string | null;
  financial: {
    grossAmount: number;
    netAmount: number;
    vatAmount: number;
    billingStatus: string;
    settlementStatus: string;
    billingMode: string;
    payerType: string;
    correctionCount: number;
    lastCorrectionAt: string | null;
  } | null;
  /** Erfasste Korrekturzeilen (append-only); oft leer in Phase 1. */
  corrections: Array<{
    id: string;
    fieldName: string;
    oldValue: string;
    newValue: string;
    reasonCode: string;
    reasonNote: string;
    actorType: string;
    actorId: string | null;
    createdAt: string;
  }>;
  /** Gefilterter Status-/Ereignisverlauf ohne Ro-Payload. */
  audit: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorType: string;
    createdAt: string;
  }>;
};

export type InsurerSummary = {
  periodHint: { from: string; to: string } | null;
  rideCount: number;
  completedCount: number;
  cancelledCount: number;
  totalGrossAmount: number;
  avgGrossPerRide: number;
  /** ride_financials: settlement offen o. ä. */
  openSettlementCount: number;
};

export type InsurerExportBatchRow = {
  id: string;
  createdAt: string;
  createdByLabel: string;
  periodFrom: string;
  periodTo: string;
  companyIdFilter: string | null;
  status: string;
  rowCount: number;
  schemaVersion: string;
  hasFile: boolean;
};

/** PLZ: erster 5-stelliger Block; Ort: grob abgeschnittener Text ohne Volladresse. */
export function parsePlzOrtFromLabel(label: string): { plz: string | null; locality: string | null } {
  const t = (label || "").trim();
  if (!t) return { plz: null, locality: null };
  const m = t.match(/\b(\d{5})\b/);
  const plz = m ? m[1]! : null;
  if (!plz) {
    return { plz: null, locality: t.length > 80 ? `${t.slice(0, 77)}…` : t };
  }
  const after = t.split(plz).pop()?.replace(/^[\s,;-]+/, "").trim() ?? "";
  const locality = after ? (after.length > 64 ? `${after.slice(0, 61)}…` : after) : null;
  return { plz, locality };
}

function boolFromNumberish(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return true;
}

export function buildProofFlags(input: {
  fromLat: number | null;
  fromLon: number | null;
  toLat: number | null;
  toLon: number | null;
  durationMinutes: number;
  partnerBookingMeta: Record<string, unknown> | null;
  billingReference: string | null;
}): InsurerProofFlags {
  const hasGpsPoints =
    boolFromNumberish(input.fromLat) &&
    boolFromNumberish(input.fromLon) &&
    boolFromNumberish(input.toLat) &&
    boolFromNumberish(input.toLon);
  const hasChronology = (input.durationMinutes ?? 0) > 0;
  const meta = input.partnerBookingMeta ?? {};
  const sig = meta.signatureReceived ?? meta.patientSignatureAt ?? meta.confirmationAt;
  const hasSignatureOrConfirmation = Boolean(sig) || (typeof meta.confirmed === "boolean" && meta.confirmed);
  const hasApprovalReference = Boolean((input.billingReference ?? "").trim());
  return {
    hasGpsPoints,
    hasChronology,
    hasSignatureOrConfirmation: Boolean(hasSignatureOrConfirmation),
    hasApprovalReference,
  };
}
