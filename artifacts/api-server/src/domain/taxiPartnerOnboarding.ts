/**
 * Mandanten-Defaults für Taxi aus Partner-Registrierung (Freigabe → admin_companies).
 */

import type { PanelModuleId } from "./panelModules";

/** Explizite Modul-Whitelist inkl. taxi_fleet (Legacy-NULL schließt taxi_fleet aus). */
export const TAXI_ONBOARDING_PANEL_MODULES: PanelModuleId[] = [
  "overview",
  "rides_list",
  "rides_create",
  "company_profile",
  "team",
  "access_codes",
  "billing",
  "taxi_fleet",
];

export function buildTaxiFarePermissionsFromRegistration(usesVouchers: boolean): Record<string, unknown> {
  return {
    source: "taxi_partner_registration",
    default_vehicle_legal_type: "taxi",
    voucher_program_enabled: usesVouchers,
  };
}

export type PartnerRegistrationRowLike = {
  partnerType: string;
  concessionNumber?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  ownerName?: string | null;
};

/** Freigabe nur, wenn Taxi-Mindestdaten vollständig sind (Plattform-Admin). */
export function taxiRegistrationIncompleteForApprove(row: PartnerRegistrationRowLike): string | null {
  if (row.partnerType !== "taxi") return null;
  if (!String(row.concessionNumber ?? "").trim()) {
    return "Konzessionsnummer fehlt.";
  }
  const hasTax = Boolean(String(row.taxId ?? "").trim());
  const hasVat = Boolean(String(row.vatId ?? "").trim());
  if (!hasTax && !hasVat) {
    return "Steuernummer oder USt-IdNr. muss hinterlegt sein.";
  }
  if (!String(row.ownerName ?? "").trim()) {
    return "Name des Inhabers / der inhabenden Person fehlt.";
  }
  return null;
}
