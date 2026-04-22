/**
 * Spiegelbild zu `artifacts/api-server/src/domain/panelModules.ts`
 * (`allowedPanelModuleIdsForCompanyKind` / Mandanten-Whitelist).
 * — bei Änderungen API und dieses Modul anpassen.
 */

const ALL = [
  "overview",
  "rides_list",
  "rides_create",
  "company_profile",
  "team",
  "access_codes",
  "hotel_mode",
  "company_rides",
  "recurring_rides",
  "billing",
  "taxi_fleet",
];

const GENERAL_LIKE = ALL.filter((id) => id !== "taxi_fleet");

const BY_KIND = {
  taxi: ["overview", "rides_list", "rides_create", "company_profile", "team", "access_codes", "billing", "taxi_fleet"],
  hotel: ["overview", "rides_list", "rides_create", "company_profile", "team", "access_codes", "hotel_mode", "billing"],
  insurer: [
    "overview",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ],
  medical: [
    "overview",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ],
  corporate: [
    "overview",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ],
  voucher_client: ["overview", "rides_list", "rides_create", "company_profile", "team", "access_codes", "billing"],
  general: GENERAL_LIKE,
};

export function allowedPanelModuleIdsForCompanyKind(companyKind) {
  const k = String(companyKind || "general").trim();
  return new Set(BY_KIND[k] ?? GENERAL_LIKE);
}

/** Modul-Katalog-Einträge für UI (Checkboxen) nach Mandanten-Typ filtern. */
export function filterModuleCatalogForCompanyKind(companyKind, moduleCatalogAz) {
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind);
  return (moduleCatalogAz || []).filter((m) => allowed.has(m.id));
}

export function filterModuleIdsDraftForCompanyKind(companyKind, draftIds) {
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind);
  const out = [];
  const seen = new Set();
  for (const id of draftIds || []) {
    if (!id || seen.has(id)) continue;
    if (!allowed.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
