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
  "insurer-overview": ["admin", "service", "insurance"],
  "insurer-rides": ["admin", "service", "insurance"],
  "insurer-exports": ["admin", "service", "insurance"],

  companies: ["admin", "service", "taxi"],
  "taxi-fleet-drivers": ["admin", "service", "taxi"],
  "taxi-fleet-vehicles": ["admin", "service", "taxi"],
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
  "homepage-placeholders": ["admin", "service"],
  "homepage-content": ["admin", "service"],

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
    id: "insurer-kasse",
    label: "Krankenkassen",
    icon: "medical",
    roles: ["admin", "service", "insurance"],
    items: [
      { pageKey: "insurer-overview", label: "Übersicht", icon: "pulse", roles: ["admin", "service", "insurance"] },
      { pageKey: "insurer-rides", label: "Fahrten", icon: "rides", roles: ["admin", "service", "insurance"] },
      { pageKey: "insurer-exports", label: "Exporte", icon: "download", roles: ["admin", "service", "insurance"] },
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
      { pageKey: "taxi-fleet-drivers", label: "Taxi · Fahrer", icon: "driver", roles: ["admin", "service", "taxi"] },
      { pageKey: "taxi-fleet-vehicles", label: "Taxi · Fahrzeuge", icon: "rides", roles: ["admin", "service", "taxi"] },
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
      { pageKey: "homepage-content", label: "Homepage-Inhalte", icon: "document", roles: R.adminSvc },
      { pageKey: "homepage-placeholders", label: "Homepage-Hinweise", icon: "document", roles: R.adminSvc },
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
  if (role === "insurance" && isAdminPageAllowed("insurer-overview", role)) {
    return "insurer-overview";
  }
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

/** Trennlinie / passiver Abschnittskopf in Top-/Sub-Navigation. */
const TOP_NAV_DIVIDER = "divider";
const TOP_NAV_SUBHEAD = "subheading";

/**
 * Eine Aktion: Seite wählen, optional `companies`-Listen-Tab in der Mandanten-Liste.
 * `companiesTab`: all | taxi | hotel | insurer | other (nur sichtbar mit pageKey "companies").
 */
function isCompaniesTabChild(it) {
  return Boolean(it && it.pageKey === "companies" && it.companiesTab);
}

/**
 * @typedef {{ pageKey: string, label: string, companiesTab?: string, type?: string, labelText?: string }} TopNavItem
 * @typedef {{ id: string, kind: "link" | "section", label: string, pageKey?: string, roles: string[], children?: any[], defaultTarget?: { pageKey: string, companiesTab?: string } }} TopNavSection
 */

const ADMIN_TOP_NAV = [
  {
    id: "tn-dashboard",
    kind: "link",
    label: "Dashboard",
    pageKey: "dashboard",
    roles: R.all,
  },
  {
    id: "tn-companies",
    kind: "section",
    label: "Unternehmen",
    roles: R.adminSvcTaxi,
    defaultTarget: { pageKey: "companies", companiesTab: "all" },
    children: [
      { pageKey: "companies", label: "Alle Mandanten", companiesTab: "all" },
      { pageKey: "companies", label: "Taxi", companiesTab: "taxi" },
      { pageKey: "companies", label: "Hotels", companiesTab: "hotel" },
      { pageKey: "companies", label: "Krankenkassen", companiesTab: "insurer" },
      { pageKey: "companies", label: "Sonstige", companiesTab: "other" },
      { type: TOP_NAV_DIVIDER },
      { pageKey: "taxi-fleet-drivers", label: "Taxi · Fahrer" },
      { pageKey: "taxi-fleet-vehicles", label: "Taxi · Fahrzeuge" },
      { pageKey: "company-registration-requests", label: "Registrierungsanfragen" },
      { pageKey: "support-inbox", label: "Partner-Anfragen" },
      { pageKey: "fleet-vehicles-review", label: "Fahrzeuge prüfen" },
    ],
  },
  {
    id: "tn-rides",
    kind: "section",
    label: "Fahrten",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    defaultTarget: { pageKey: "rides" },
    children: [
      { pageKey: "rides", label: "Alle Fahrten" },
      { pageKey: "ride-new", label: "Neue Fahrt" },
      { pageKey: "docs-hub", label: "Dokumente & PDF" },
      { pageKey: "fares", label: "Tarife & Preise" },
    ],
  },
  {
    id: "tn-drivers",
    kind: "section",
    label: "Fahrer",
    roles: ["admin", "service", "taxi"],
    defaultTarget: { pageKey: "drivers-overview" },
    children: [
      { pageKey: "drivers-overview", label: "Fahrerübersicht" },
      { pageKey: "drivers-revenue", label: "Umsatz je Fahrer" },
      { pageKey: "drivers-rides", label: "Fahrten je Fahrer" },
      { pageKey: "drivers-status", label: "Status" },
    ],
  },
  {
    id: "tn-billing",
    kind: "section",
    label: "Abrechnung",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    defaultTarget: { pageKey: "finance-dashboard" },
    children: [
      { type: TOP_NAV_SUBHEAD, labelText: "B2B Krankenkasse" },
      { pageKey: "insurer-overview", label: "Kasse · Übersicht" },
      { pageKey: "insurer-rides", label: "Kasse · Fahrten" },
      { pageKey: "insurer-exports", label: "Kasse · Exporte" },
      { type: TOP_NAV_DIVIDER },
      { pageKey: "billing-credits", label: "Gutschriften" },
      { pageKey: "billing-invoices", label: "Rechnungen" },
      { pageKey: "billing-open", label: "Offene Zahlungen" },
      { pageKey: "billing-cycles", label: "Wochen- / Monatsabrechnung" },
      { pageKey: "billing-hotel", label: "Buchungen (Hotel)" },
      { type: TOP_NAV_DIVIDER },
      { pageKey: "finance-audit", label: "Finanzen · Audit" },
      { pageKey: "finance-dashboard", label: "Finanzen · Dashboard" },
      { pageKey: "finance-invoices", label: "Finanzen · Invoices" },
      { pageKey: "finance-ride-financials", label: "Finanzen · Ride Financials" },
    ],
  },
  {
    id: "tn-settings",
    kind: "section",
    label: "Einstellungen",
    roles: ["admin", "service", "taxi", "insurance", "hotel"],
    defaultTarget: { pageKey: "settings" },
    children: [
      { type: TOP_NAV_SUBHEAD, labelText: "Krankenfahrten" },
      { pageKey: "health-approvals", label: "Genehmigungen" },
      { pageKey: "health-bulk", label: "Sammelabrechnung" },
      { pageKey: "health-insurers", label: "Krankenkassen (Fahrten)" },
      { pageKey: "health-overview", label: "Übersicht" },
      { pageKey: "health-prescriptions", label: "Verordnungen" },
      { type: TOP_NAV_DIVIDER },
      { type: TOP_NAV_SUBHEAD, labelText: "Benutzer & Erweiterungen" },
      { pageKey: "access-codes", label: "Zugangscodes" },
      { pageKey: "export-hub", label: "Export" },
      { pageKey: "users-admin", label: "Admin-Zugänge" },
      { pageKey: "users-panel", label: "Partner-Zugänge" },
      { pageKey: "users-roles", label: "Rollen & Rechte" },
      { pageKey: "homepage-content", label: "Homepage-Inhalte" },
      { pageKey: "homepage-placeholders", label: "Homepage-Hinweise" },
      { type: TOP_NAV_DIVIDER },
      { type: TOP_NAV_SUBHEAD, labelText: "Konsole" },
      { pageKey: "settings", label: "Konto & Sicherheit" },
      { pageKey: "settings-api", label: "API & Token" },
      { pageKey: "settings-branding", label: "Branding (PDF)" },
      { pageKey: "settings-payments", label: "Zahlungsarten" },
      { pageKey: "settings-system", label: "System" },
    ],
  },
];

function filterTopNavItem(it, role) {
  if (!it) return null;
  if (it.type === TOP_NAV_DIVIDER || it.type === TOP_NAV_SUBHEAD) {
    return it;
  }
  if (isCompaniesTabChild(it)) {
    return isAdminPageAllowed("companies", role) ? it : null;
  }
  if (it.pageKey && isAdminPageAllowed(it.pageKey, role)) {
    return it;
  }
  return null;
}

function isNavTargetAllowed(t, role) {
  if (!t?.pageKey) return false;
  if (t.pageKey === "companies" && t.companiesTab) {
    if (!isAdminPageAllowed("companies", role)) return false;
    return String(t.companiesTab).length > 0;
  }
  return isAdminPageAllowed(t.pageKey, role);
}

function toNavTarget(c) {
  if (!c || c.type === TOP_NAV_DIVIDER || c.type === TOP_NAV_SUBHEAD) {
    return null;
  }
  if (isCompaniesTabChild(c)) {
    return { pageKey: "companies", companiesTab: c.companiesTab || "all" };
  }
  if (c.pageKey) {
    return { pageKey: c.pageKey, companiesTab: undefined };
  }
  return null;
}

/**
 * Doppelte Trennlinien entfernen, führende/schließende Trennlinien.
 */
function normalizeDividersAndSubheads(list) {
  if (!list || list.length === 0) return [];
  const out = list.filter((x) => x);
  const res = [];
  for (const x of out) {
    if (x.type === TOP_NAV_DIVIDER) {
      if (res.length === 0) continue;
      if (res[res.length - 1].type === TOP_NAV_DIVIDER) continue;
      res.push(x);
    } else if (x.type === TOP_NAV_SUBHEAD) {
      if (res.length > 0 && res[res.length - 1].type === TOP_NAV_SUBHEAD) {
        res[res.length - 1] = x;
      } else {
        res.push(x);
      }
    } else {
      res.push(x);
    }
  }
  while (res.length > 0 && res[0].type === TOP_NAV_DIVIDER) res.shift();
  while (res.length > 0 && res[res.length - 1].type === TOP_NAV_DIVIDER) res.pop();
  return res;
}

function firstAllowedFromChildren(children, role) {
  const filtered = children.map((c) => filterTopNavItem(c, role)).filter((c) => c);
  for (const c of filtered) {
    if (c.type === TOP_NAV_DIVIDER || c.type === TOP_NAV_SUBHEAD) continue;
    if (c.pageKey) {
      if (isCompaniesTabChild(c)) {
        if (isAdminPageAllowed("companies", role)) return c;
        continue;
      }
      if (isAdminPageAllowed(c.pageKey, role)) {
        return c;
      }
    }
  }
  return null;
}

/**
 * Sichtbare Top-Navigation (Zeile 1) und Filter für Sektionen.
 */
export function getTopNavForRole(role) {
  const out = [];
  for (const sec of ADMIN_TOP_NAV) {
    if (!sec.roles.includes(role)) continue;
    if (sec.kind === "link") {
      if (!sec.pageKey || !isAdminPageAllowed(sec.pageKey, role)) continue;
      out.push({ id: sec.id, kind: "link", label: sec.label, pageKey: sec.pageKey });
    } else {
      const children = normalizeDividersAndSubheads(
        (sec.children || [])
          .map((c) => filterTopNavItem(c, role))
          .filter((c) => c),
      );
      if (children.length === 0) continue;
      const first = firstAllowedFromChildren(sec.children || [], role);
      if (!first) continue;
      const firstT = toNavTarget(first);
      if (!firstT) continue;
      let defaultTarget;
      if (sec.defaultTarget?.pageKey) {
        if (isCompaniesTabChild({ pageKey: sec.defaultTarget.pageKey, companiesTab: sec.defaultTarget.companiesTab })) {
          const dt = { pageKey: "companies", companiesTab: sec.defaultTarget.companiesTab || "all" };
          defaultTarget = isNavTargetAllowed(dt, role) ? dt : firstT;
        } else {
          const dt = { pageKey: sec.defaultTarget.pageKey, companiesTab: undefined };
          defaultTarget = isNavTargetAllowed(dt, role) ? dt : firstT;
        }
      } else {
        defaultTarget = firstT;
      }
      out.push({
        id: sec.id,
        kind: "section",
        label: sec.label,
        children,
        defaultTarget,
      });
    }
  }
  return out;
}

/**
 * Sektion ab aktiver Seite / Mandanten-Tab; `null` wenn unklar.
 */
export function getTopNavSectionIdForState(active, companiesListTab, role) {
  const tab = companiesListTab != null && companiesListTab !== "" ? companiesListTab : "all";
  const sections = getTopNavForRole(role);
  for (const sec of sections) {
    if (sec.kind === "link" && sec.pageKey === active) {
      return sec.id;
    }
    if (sec.kind !== "section" || !sec.children) continue;
    for (const c of sec.children) {
      if (c.type === TOP_NAV_DIVIDER || c.type === TOP_NAV_SUBHEAD) continue;
      if (active === "companies" && c.pageKey === "companies") {
        if ((c.companiesTab || "all") === tab) {
          return sec.id;
        }
        continue;
      }
      if (c.pageKey === active) {
        return sec.id;
      }
    }
  }
  if (active === "companies" && isAdminPageAllowed("companies", role)) {
    return "tn-companies";
  }
  return null;
}

/**
 * Sichtbare Unter-Navigation (Zeile 2) als Rohliste inkl. Trennlinie / Subhead.
 */
export function getTopNavSubRowForState(active, companiesListTab, role) {
  const id = getTopNavSectionIdForState(active, companiesListTab, role);
  if (!id) return [];
  const sec = getTopNavForRole(role).find((s) => s.id === id);
  if (!sec || sec.kind !== "section" || !sec.children) return [];
  return sec.children;
}
