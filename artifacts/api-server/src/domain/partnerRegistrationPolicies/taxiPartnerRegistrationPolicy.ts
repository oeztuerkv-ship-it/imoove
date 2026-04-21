import {
  buildTaxiFarePermissionsFromRegistration,
  TAXI_ONBOARDING_PANEL_MODULES,
  taxiRegistrationIncompleteForApprove,
} from "../taxiPartnerOnboarding";
import type { PartnerRegistrationCompanyApproveExtras, PartnerRegistrationPolicy } from "./types";

function str(body: Record<string, unknown>, k: string): string {
  return typeof body[k] === "string" ? body[k].trim() : "";
}

export const taxiPartnerRegistrationPolicy: PartnerRegistrationPolicy = {
  id: "taxi",
  labelDe: "Taxiunternehmen",
  publicRequiredFieldKeysPlan: [
    "concessionNumber",
    "taxId",
    "vatId",
    "ownerName",
    "addressLine1",
    "postalCode",
    "city",
    "country",
  ] as const,
  validatePublicRegistration(body: Record<string, unknown>): string | null {
    if (str(body, "partnerType") !== "taxi") return null;
    if (!str(body, "concessionNumber")) {
      return "Für Taxiunternehmen ist die Konzessionsnummer Pflicht.";
    }
    if (!str(body, "taxId") || !str(body, "vatId")) {
      return "Für Taxiunternehmen sind Steuernummer und USt-IdNr. Pflicht.";
    }
    if (!str(body, "ownerName")) {
      return "Für Taxiunternehmen ist der Inhaber / die inhabende Person Pflicht.";
    }
    return null;
  },
  approveIncompleteReason(row) {
    return taxiRegistrationIncompleteForApprove({
      partnerType: row.partnerType,
      concessionNumber: row.concessionNumber,
      taxId: row.taxId,
      vatId: row.vatId,
      ownerName: row.ownerName,
    });
  },
  buildCompanyApproveExtras(row): PartnerRegistrationCompanyApproveExtras {
    if (row.partnerType !== "taxi") return {};
    return {
      panel_modules: [...TAXI_ONBOARDING_PANEL_MODULES],
      fare_permissions: buildTaxiFarePermissionsFromRegistration(row.usesVouchers),
    };
  },
};
