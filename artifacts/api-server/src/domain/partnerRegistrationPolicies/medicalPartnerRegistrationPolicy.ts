import type { PartnerRegistrationPolicy } from "./types";

/**
 * Partner-Typ **Medical / Gesundheits-Partner** (`medical` / `care` → `company_kind` medical).
 *
 * Fachlich: medizinische Fahrten/Transportlogik, Serienfahrten, Hin-/Rückfahrten, medizinische Referenzen —
 * **Leistungspartner**, nicht Kostenträger (`insurance` / insurer).
 *
 * Nicht mit Krankenkasse vermischen.
 */
export const medicalPartnerRegistrationPolicy: PartnerRegistrationPolicy = {
  id: "medical",
  labelDe: "Medical / Krankenfahrt",
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
    // Geplant: Serien/Referenzen — eher Buchungs- als Nur-Anfrage-Felder; schrittweise nachziehen
  ] as const,
  validatePublicRegistration(): string | null {
    return null;
  },
  approveIncompleteReason(): string | null {
    return null;
  },
  buildCompanyApproveExtras() {
    return {};
  },
};

/** Pflege & Leistungspartner: gleiche Mandanten-Art wie medical, eigene Policy-Instanz (id care). */
export const carePartnerRegistrationPolicy: PartnerRegistrationPolicy = {
  ...medicalPartnerRegistrationPolicy,
  id: "care",
  labelDe: "Pflege & Leistungspartner",
};
