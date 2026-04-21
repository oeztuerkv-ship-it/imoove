import type { PartnerRegistrationPolicy } from "./types";

/**
 * Krankenkasse / Versicherer (`partner_type` insurance → `company_kind` insurer).
 * Strikt getrennt von Medical — keine gemeinsame Approve-Logik mit medical.
 */
export const insurerPartnerRegistrationPolicy: PartnerRegistrationPolicy = {
  id: "insurance",
  labelDe: "Krankenkasse / Versicherer",
  publicRequiredFieldKeysPlan: [
    "companyName",
    "addressLine1",
    "postalCode",
    "city",
    "country",
    "email",
    "phone",
    "contactFirstName",
    "contactLastName",
    // Geplant: Leistungsträger-Referenz, ggf. Kostenstelle-Default in fare_permissions — später
  ] as const,
  validatePublicRegistration(): string | null {
    return null;
  },
  approveIncompleteReason(): string | null {
    return null;
  },
  buildCompanyApproveExtras() {
    /** Später: insurer_permissions-Defaults setzen, nicht mit medical teilen. */
    return {};
  },
};
