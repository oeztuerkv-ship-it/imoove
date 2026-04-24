/**
 * Modulare Admin-Konsole: Sichtbarkeit pro Rolle (muss zur API in adminConsoleRoles.ts passen).
 * Unterpunkte innerhalb einer Gruppe alphabetisch nach Label (de).
 */

export const ADMIN_ROLES = ["admin", "service", "taxi", "insurance", "hotel"];

/** Flache Zuordnung Seite → erlaubte Rollen (Quelle der Wahrheit für Redirects). */
export const ADMIN_PAGE_ROLES = {
  dashboard: ["admin", "service", "taxi", "insurance", "hotel"],

  rides: ["admin", "service", "taxi", "insurance", "hotel"],
  "ride-new": ["admin", "service", "taxi", "insurance", "hotel"],

  "billing-invoices": ["admin", "service", "taxi", "insurance"],
  "billing-credits": ["admin", "service", "taxi", "insurance"],
  "billing-open": ["admin", "service", "taxi", "insurance"],
  "billing-cycles": ["admin", "service", "taxi", "insurance"],
  "billing-hotel": ["admin", "service", "hotel"],
  "finance-dashboard": ["admin", "service", "taxi", "insurance"],
  "finance-ride-financials": ["admin", "service", "taxi", "insurance"],
  "finance-invoices": ["admin", "service", "taxi", "insurance"],
  "finance-audit": ["admin", "service", "taxi", "insurance"],

  "docs-hub": ["admin", "service", "taxi", "insurance", "hotel"],

  fares: ["admin", "taxi"],

  "health-overview": ["admin", "service", "taxi", "insurance"],
  "health-approvals": ["admin", "service", "taxi", "insurance"],
  "health-insurers": ["admin", "service", "taxi", "insurance"],
  "health-prescriptions": ["admin", "service", "taxi", "insurance"],
  "health-bulk": ["admin", "service", "taxi", "insurance"],

  companies: ["admin", "service", "taxi"],
  "company-registration-requests": ["admin", "service"],
  "support-inbox": ["admin", "service"],
  "fleet-vehicles-review": ["admin", "service"],

  "drivers-overview": ["admin", "service", "taxi"],
  "drivers-status": ["admin", "service", "taxi"],
  "drivers-rides": ["admin", "service", "taxi"],
  "drivers-revenue": ["admin", "service", "taxi"],

  "users-admin": ["admin"],
  "users-panel": ["admin", "service"],
  "users-roles": ["admin"],

  "export-hub": ["admin", "service", "insurance"],

  "access-codes": ["admin", "service", "taxi"],

  settings: ["admin", "service", "taxi", "insurance", "hotel"],
  "settings-api": ["admin"],
  "settings-branding": ["admin"],
  "settings-payments": ["admin"],
  "settings-system": ["admin"],
};

const R = {
  all: ADMIN_ROLES,
  admin: ["admin"],
  adminSvc: ["admin", "service"],
  adminSvcTaxi: ["admin", "service", "taxi"],
};

/** Gruppen mit Icons; items werden bei Export alphabetisch sortiert. */
const ADMIN_NAV_GROUPS_RAW = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "chart",
    roles: R.all,
    items: [
      { pageKey: "dashboard", label: "Plattform-Cockpit", icon: "pulse", roles: R.all },
    ],
  },
  {
    id: "rides",
    label: "Fahrten",
    icon: "rides",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    items: [
      { pageKey: "rides", label: "Alle Fahrten", icon: "rides", roles: ["admin", "service", "taxi", "insurance", "hotel"] },
      { pageKey: "ride-new", label: "Neue Fahrt", icon: "plus", roles: ["admin", "service", "taxi", "insurance", "hotel"] },
    ],
  },
  {
    id: "billing",
    label: "Abrechnung",
    icon: "wallet",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    items: [
      { pageKey: "billing-credits", label: "Gutschriften", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "billing-invoices", label: "Rechnungen", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "billing-open", label: "Offene Zahlungen", icon: "wallet", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "billing-cycles", label: "Wochen- / Monatsabrechnung", icon: "chart", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "billing-hotel", label: "Übersicht Buchungen (Hotel)", icon: "building", roles: ["admin", "service", "hotel"] },
    ],
  },
  {
    id: "finance",
    label: "Finanzen",
    icon: "wallet",
    roles: ["admin", "service", "taxi", "insurance"],
    items: [
      { pageKey: "finance-audit", label: "Audit", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "finance-dashboard", label: "Dashboard", icon: "chart", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "finance-invoices", label: "Invoices", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "finance-ride-financials", label: "Ride Financials", icon: "rides", roles: ["admin", "service", "taxi", "insurance"] },
    ],
  },
  {
    id: "documents",
    label: "Dokumente / PDF",
    icon: "document",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    items: [{ pageKey: "docs-hub", label: "PDF & Exporte", icon: "document", roles: ["admin", "service", "taxi", "insurance", "hotel"] }],
  },
  {
    id: "fares",
    label: "Tarife / Preise",
    icon: "map",
    roles: ["admin", "taxi"],
    items: [{ pageKey: "fares", label: "Preisregeln & Gebiete", icon: "map", roles: ["admin", "taxi"] }],
  },
  {
    id: "health",
    label: "Krankenfahrten",
    icon: "medical",
    roles: ["admin", "service", "taxi", "insurance"],
    items: [
      { pageKey: "health-approvals", label: "Genehmigungen", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "health-insurers", label: "Krankenkassen", icon: "people", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "health-overview", label: "Übersicht", icon: "pulse", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "health-prescriptions", label: "Verordnungen", icon: "document", roles: ["admin", "service", "taxi", "insurance"] },
      { pageKey: "health-bulk", label: "Sammelabrechnung", icon: "wallet", roles: ["admin", "service", "taxi", "insurance"] },
    ],
  },
  {
    id: "companies",
    label: "Unternehmen",
    icon: "building",
    roles: ["admin", "service", "taxi"],
    items: [
      { pageKey: "companies", label: "Firmenliste & Profile", icon: "building", roles: ["admin", "service", "taxi"] },
      { pageKey: "company-registration-requests", label: "Registrierungsanfragen", icon: "document", roles: R.adminSvc },
      { pageKey: "support-inbox", label: "Partner-Anfragen", icon: "document", roles: R.adminSvc },
      { pageKey: "fleet-vehicles-review", label: "Fahrzeuge prüfen", icon: "rides", roles: R.adminSvc },
    ],
  },
  {
    id: "drivers",
    label: "Fahrer",
    icon: "driver",
    roles: ["admin", "service", "taxi"],
    items: [
      { pageKey: "drivers-overview", label: "Fahrerübersicht", icon: "people", roles: ["admin", "service", "taxi"] },
      { pageKey: "drivers-revenue", label: "Umsatz je Fahrer", icon: "wallet", roles: ["admin", "service", "taxi"] },
      { pageKey: "drivers-rides", label: "Fahrten je Fahrer", icon: "rides", roles: ["admin", "service", "taxi"] },
      { pageKey: "drivers-status", label: "Status", icon: "pulse", roles: ["admin", "service", "taxi"] },
    ],
  },
  {
    id: "users",
    label: "Benutzer & Rollen",
    icon: "people",
    roles: ["admin", "service"],
    items: [
      { pageKey: "users-admin", label: "Admin-Zugänge", icon: "people", roles: ["admin"] },
      { pageKey: "users-panel", label: "Partner-Zugänge", icon: "people", roles: ["admin", "service"] },
      { pageKey: "users-roles", label: "Rollen & Rechte", icon: "key", roles: ["admin"] },
    ],
  },
  {
    id: "access",
    label: "Zugangscodes",
    icon: "key",
    roles: ["admin", "service", "taxi"],
    items: [{ pageKey: "access-codes", label: "Digitale Freigaben", icon: "key", roles: ["admin", "service", "taxi"] }],
  },
  {
    id: "export",
    label: "Export",
    icon: "download",
    roles: ["admin", "service", "insurance"],
    items: [{ pageKey: "export-hub", label: "CSV / DATEV / Filterexport", icon: "download", roles: ["admin", "service", "insurance"] }],
  },
  {
    id: "settings",
    label: "Einstellungen",
    icon: "cog",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    items: [
      { pageKey: "settings-api", label: "API & Token", icon: "key", roles: ["admin"] },
      { pageKey: "settings-branding", label: "Branding (PDF)", icon: "document", roles: ["admin"] },
      { pageKey: "settings-payments", label: "Zahlungsarten", icon: "wallet", roles: ["admin"] },
      { pageKey: "settings", label: "Konto & Sicherheit", icon: "cog", roles: ["admin", "service", "taxi", "insurance", "hotel"] },
      { pageKey: "settings-system", label: "System", icon: "cog", roles: ["admin"] },
    ],
  },
];

function sortItemsAz(items) {
  return [...items].sort((a, b) =>
    a.label.localeCompare(b.label, "de", { sensitivity: "base" }),
  );
}

export function getAdminNavGroupsForRole(role) {
  return ADMIN_NAV_GROUPS_RAW.map((g) => ({
    ...g,
    items: sortItemsAz(g.items.filter((it) => it.roles.includes(role))),
  })).filter((g) => g.roles.includes(role) && g.items.length > 0);
}

export function isAdminPageAllowed(pageKey, role) {
  const allowed = ADMIN_PAGE_ROLES[pageKey];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function firstAllowedAdminPage(role) {
  const order = [
    "dashboard",
    "rides",
    "health-overview",
    "docs-hub",
    "billing-invoices",
    "fares",
    "companies",
    "settings",
  ];
  for (const k of order) {
    if (isAdminPageAllowed(k, role)) return k;
  }
  const any = Object.keys(ADMIN_PAGE_ROLES).find((k) => ADMIN_PAGE_ROLES[k].includes(role));
  return any || "dashboard";
}

export function findNavGroupIdForPage(pageKey) {
  for (const g of ADMIN_NAV_GROUPS_RAW) {
    if (g.items.some((it) => it.pageKey === pageKey)) return g.id;
  }
  return null;
}
