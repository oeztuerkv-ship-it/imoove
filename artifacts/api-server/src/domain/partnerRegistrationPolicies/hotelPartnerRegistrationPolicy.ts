import type { PartnerRegistrationPolicy } from "./types";

/**
 * Hotel — Zielbild (noch nicht verschärft): eigene Pflichten, Freigabe-Check, Defaults.
 * Nächster Schritt: Felder ergänzen (z. B. Rechnungsart), dann validatePublic + approveIncomplete befüllen.
 */
export const hotelPartnerRegistrationPolicy: PartnerRegistrationPolicy = {
  id: "hotel",
  labelDe: "Hotel",
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
    // Geplant: hotelTyp, Rechnungsart / Zimmer-Ledger-Kontext — noch kein separates JSON-Feld in der Anfrage
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
