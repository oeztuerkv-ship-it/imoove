import type { PartnerType } from "../../db/partnerRegistrationRequestsData";
import type { PartnerRegistrationPolicy } from "./types";

function makeGeneralPolicy(id: PartnerType, labelDe: string, plan: readonly string[]): PartnerRegistrationPolicy {
  return {
    id,
    labelDe,
    publicRequiredFieldKeysPlan: plan,
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
}

export const businessPartnerRegistrationPolicy = makeGeneralPolicy("business", "Unternehmen / Corporate", [
  "companyName",
  "addressLine1",
  "postalCode",
  "city",
  "country",
  "email",
  "phone",
  "contactFirstName",
  "contactLastName",
] as const);

export const voucherPartnerRegistrationPolicy = makeGeneralPolicy("voucher_partner", "Gutscheinpartner", [
  "companyName",
  "addressLine1",
  "postalCode",
  "city",
  "country",
  "email",
  "phone",
  "contactFirstName",
  "contactLastName",
] as const);

export const otherPartnerRegistrationPolicy = makeGeneralPolicy("other", "Sonstiges", [
  "companyName",
  "addressLine1",
  "postalCode",
  "city",
  "country",
  "email",
  "phone",
  "contactFirstName",
  "contactLastName",
] as const);
