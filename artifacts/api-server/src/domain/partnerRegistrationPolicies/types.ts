import type { AdminCompanyUpdateBody } from "../../db/adminData";
import type { findPartnerRegistrationRequestById, PartnerType } from "../../db/partnerRegistrationRequestsData";

/** Zeilenform wie nach DB-Map (Admin / Approve). */
export type PartnerRegistrationRequestRow = NonNullable<
  Awaited<ReturnType<typeof findPartnerRegistrationRequestById>>
>;

/** Nur Felder, die `insertAdminCompany` bei Freigabe typweise zusätzlich setzen darf. */
export type PartnerRegistrationCompanyApproveExtras = Pick<
  AdminCompanyUpdateBody,
  "panel_modules" | "fare_permissions" | "insurer_permissions"
>;

/**
 * Eine Policy pro `partner_type` — keine gemischte „weiche“ Logik zentral.
 * Taxi ist produktiv; andere Typen: Platzhalter für geplante Pflichten / Defaults.
 */
export interface PartnerRegistrationPolicy {
  readonly id: PartnerType;
  /** Kurzname für Fehlermeldungen / Doku */
  readonly labelDe: string;
  /**
   * Geplante Pflichtfelder im öffentlichen POST-Body (API-CamelCase).
   * Hinweis für Team & spätere Validierung — nicht alle Typen sind serverseitig schon durchgesetzt.
   */
  readonly publicRequiredFieldKeysPlan: readonly string[];
  /** `POST /panel-auth/registration-request`: null = ok, sonst Kurzgrund (HTTP 400). */
  validatePublicRegistration(body: Record<string, unknown>): string | null;
  /** Admin-Freigabe: null = ok, sonst Kurzgrund (HTTP 400). */
  approveIncompleteReason(row: PartnerRegistrationRequestRow): string | null;
  /** Zusatz zu den Standard-Feldern in `insertAdminCompany` bei Approve. */
  buildCompanyApproveExtras(row: PartnerRegistrationRequestRow): PartnerRegistrationCompanyApproveExtras;
}
