/** Freigeschaltete Mandantenarten für Partner-App (Mobile). */
export const PARTNER_MOBILE_ALLOWED_COMPANY_KINDS = new Set([
  "hotel",
  "corporate",
  "voucher_client",
  "general",
]);

export type PartnerMeUser = {
  id: string;
  companyId: string;
  companyName: string;
  companyKind: string;
  username: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
  panelModules?: string[];
  permissions?: string[];
};

export function partnerMobileAccessDeniedReason(user: PartnerMeUser | null): string | null {
  if (!user) return "Kein Partner-Profil.";
  const kind = (user.companyKind ?? "").trim();
  if (!PARTNER_MOBILE_ALLOWED_COMPANY_KINDS.has(kind)) {
    return "Diese Partner-App ist für Ihren Unternehmenstyp noch nicht freigeschaltet.";
  }
  const modules = user.panelModules ?? [];
  if (!modules.includes("rides_create")) {
    return "Taxi bestellen ist für Ihr Konto nicht freigeschaltet.";
  }
  if (!modules.includes("rides_list")) {
    return "Fahrtenübersicht ist für Ihr Konto nicht freigeschaltet.";
  }
  if (user.mustChangePassword) {
    return "Bitte zuerst im Partner-Portal (panel.onroda.de) Ihr Passwort ändern.";
  }
  return null;
}

export function isPartnerMobileAllowed(user: PartnerMeUser | null): boolean {
  return partnerMobileAccessDeniedReason(user) === null;
}
