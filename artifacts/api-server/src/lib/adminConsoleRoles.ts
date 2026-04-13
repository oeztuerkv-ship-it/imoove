import type { AdminRideListQuery } from "../db/ridesData";
import type { PayerKind } from "../domain/rideBillingProfile";

export const ADMIN_ROLE_VALUES = ["admin", "service", "taxi", "insurance", "hotel"] as const;
export type AdminRole = (typeof ADMIN_ROLE_VALUES)[number];

export function parseAdminRole(raw: string): AdminRole | null {
  const s = raw.trim();
  return (ADMIN_ROLE_VALUES as readonly string[]).includes(s) ? (s as AdminRole) : null;
}

/** Vollzugriff Plattform (Menü + API wie bisheriger `admin`). */
export function isFullAdminRole(role: AdminRole): boolean {
  return role === "admin";
}

export function canAccessAdminStats(role: AdminRole): boolean {
  return role !== "hotel";
}

export function canAccessAdminDashboardOverview(role: AdminRole): boolean {
  return role !== "hotel";
}

export function canReadAdminCompaniesList(role: AdminRole): boolean {
  return role === "admin" || role === "service" || role === "taxi" || role === "hotel";
}

export function canMutateAdminCompanies(role: AdminRole): boolean {
  return role === "admin" || role === "service";
}

export function canMutateAdminFareAreas(role: AdminRole): boolean {
  return role === "admin" || role === "taxi";
}

export function canAccessAdminAccessCodes(role: AdminRole): boolean {
  return role === "admin" || role === "service" || role === "taxi";
}

export function canManageAdminAuthUsersApi(role: AdminRole): boolean {
  return role === "admin";
}

export function canAdminReleaseRide(role: AdminRole): boolean {
  return role === "admin" || role === "service" || role === "taxi" || role === "hotel";
}

const HOTEL_NO_SCOPE_COMPANY_ID = "__onroda_hotel_no_scope__";

export function mergeAdminRideListQueryForPrincipal(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  query: AdminRideListQuery,
): AdminRideListQuery {
  if (role === "insurance") {
    return { ...query, payerKind: "insurance" };
  }
  if (role === "hotel") {
    const id = scopeCompanyId?.trim();
    return { ...query, companyId: id || HOTEL_NO_SCOPE_COMPANY_ID };
  }
  return query;
}

export function adminRideRowVisibleToPrincipal(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  ride: { payerKind?: PayerKind | string | null; companyId?: string | null },
): boolean {
  if (role === "insurance") {
    return ride.payerKind === "insurance";
  }
  if (role === "hotel") {
    const id = scopeCompanyId?.trim();
    if (!id) return false;
    return String(ride.companyId ?? "") === id;
  }
  return true;
}
