import type { PanelCompanyKind } from "../db/panelCompanyData";

/** Mandanten-Typen, die Sofortfahrten über POST /panel/v1/rides buchen dürfen. */
const INSTANT_RIDE_PANEL_COMPANY_KINDS = new Set<PanelCompanyKind>(["hotel", "corporate", "taxi"]);

export function panelCompanyKindAllowsInstantRide(companyKind: PanelCompanyKind | string | null | undefined): boolean {
  const k = String(companyKind ?? "").trim() as PanelCompanyKind;
  return INSTANT_RIDE_PANEL_COMPANY_KINDS.has(k);
}

export function isPanelInstantRideBooking(scheduledAtIso: string | null | undefined): boolean {
  const s = String(scheduledAtIso ?? "").trim();
  return !s;
}
