import type { PartnerRegistrationPolicy } from "./types";

/**
 * Partner-Typ **Krankenkasse / Kostenträger** (`partner_type` insurance → `company_kind` insurer).
 *
 * Fachlich: payer/insurance, Kostenübernahme, Referenz/Fallnummer/Kostenstelle, Abrechnung/Nachvollziehbarkeit —
 * keine normalen Hotel- oder Taxi-Standard-Workflows.
 *
 * Strikt getrennt von Medical (Leistungspartner) — keine gemeinsame Approve-Logik mit medical/care.
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
