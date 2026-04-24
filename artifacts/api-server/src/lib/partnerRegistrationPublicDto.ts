/**
 * Öffentliche, nicht vertrauliche Teilmenge einer Partner-Registrierungsanfrage
 * (Statusseite: E-Mail + Referenz-ID, kein Login).
 */

export type PublicPartnerRegistrationSnapshot = {
  id: string;
  companyName: string;
  partnerType: string;
  registrationStatus: string;
  verificationStatus: string;
  complianceStatus: string;
  contractStatus: string;
  missingDocumentsNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  /** Freigabe erteilt und Mandant verknüpft — Login unter Partner-Portal möglich. */
  panelAccessReady: boolean;
};

type RegistrationRowLike = {
  id: string;
  companyName: string;
  partnerType: string;
  registrationStatus: string;
  verificationStatus: string;
  complianceStatus: string;
  contractStatus: string;
  missingDocumentsNote: string | null;
  linkedCompanyId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type PublicPartnerRegistrationDocument = {
  id: string;
  category: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
};

type RegistrationDocFields = {
  id: string;
  category: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
};

export function toPublicPartnerRegistrationDocument(d: RegistrationDocFields): PublicPartnerRegistrationDocument {
  return {
    id: d.id,
    category: d.category,
    originalFileName: d.originalFileName,
    mimeType: d.mimeType,
    fileSizeBytes: d.fileSizeBytes,
    createdAt: d.createdAt,
  };
}

export function toPublicPartnerRegistrationDocuments(
  docs: Array<RegistrationDocFields>,
): PublicPartnerRegistrationDocument[] {
  return docs.map(toPublicPartnerRegistrationDocument);
}

export function toPublicPartnerRegistrationSnapshot(row: RegistrationRowLike): PublicPartnerRegistrationSnapshot {
  return {
    id: row.id,
    companyName: row.companyName,
    partnerType: row.partnerType,
    registrationStatus: row.registrationStatus,
    verificationStatus: row.verificationStatus,
    complianceStatus: row.complianceStatus,
    contractStatus: row.contractStatus,
    missingDocumentsNote: row.missingDocumentsNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewedAt: row.reviewedAt,
    panelAccessReady: row.registrationStatus === "approved" && Boolean(row.linkedCompanyId),
  };
}

/** Nur Ereignisse, die für Bewerber:innen ohne Payload-Lecks sinnvoll sind (Status-Link). */
const PUBLIC_REGISTRATION_TIMELINE_EVENT_TYPES = new Set([
  "request_submitted",
  "message",
  "document_uploaded",
  "admin_document_added",
  "master_data_change_requested",
  "approved_company_created",
  "admin_status_update",
  "admin_master_data_update",
  "panel_owner_provisioned",
]);

export type PublicPartnerRegistrationTimelineEvent = {
  id: string;
  createdAt: string;
  actorType: string;
  actorLabel: string;
  eventType: string;
  message: string;
};

type TimelineRowLike = {
  id: string;
  createdAt: string;
  actorType: string;
  actorLabel: string;
  eventType: string;
  message: string;
};

/**
 * Öffentlicher Verlauf: gleiche Texte wie intern, aber **ohne** `payload` (keine Admin-Interna / IDs).
 */
export function toPublicPartnerRegistrationTimeline(
  rows: TimelineRowLike[],
): PublicPartnerRegistrationTimelineEvent[] {
  const out: PublicPartnerRegistrationTimelineEvent[] = [];
  for (const r of rows) {
    const et = String(r.eventType || "").trim();
    if (!PUBLIC_REGISTRATION_TIMELINE_EVENT_TYPES.has(et)) continue;
    out.push({
      id: r.id,
      createdAt: r.createdAt,
      actorType: String(r.actorType || "").trim() || "partner",
      actorLabel: String(r.actorLabel || "").trim(),
      eventType: et,
      message: String(r.message || "").trim(),
    });
  }
  return out;
}
