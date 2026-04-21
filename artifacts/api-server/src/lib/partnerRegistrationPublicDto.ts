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

export function toPublicPartnerRegistrationDocuments(
  docs: Array<{
    id: string;
    category: string;
    originalFileName: string;
    mimeType: string;
    fileSizeBytes: number;
    createdAt: string;
  }>,
): PublicPartnerRegistrationDocument[] {
  return docs.map((d) => ({
    id: d.id,
    category: d.category,
    originalFileName: d.originalFileName,
    mimeType: d.mimeType,
    fileSizeBytes: d.fileSizeBytes,
    createdAt: d.createdAt,
  }));
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
