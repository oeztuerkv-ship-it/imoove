/**
 * Navigation ↔ Panel-Module (IDs müssen mit API `domain/panelModules` übereinstimmen).
 * @type {readonly { key: string; moduleId: string; label: string; icon: string }[]}
 */
export const PANEL_NAV_ITEMS = [
  { key: "overview", moduleId: "overview", label: "Übersicht", icon: "◫" },
  { key: "rides-mine", moduleId: "rides_list", label: "Meine Fahrten", icon: "☰" },
  { key: "rides-new", moduleId: "rides_create", label: "Neue Fahrt", icon: "+" },
  { key: "rides-history", moduleId: "rides_list", label: "Verlauf", icon: "↺" },
  { key: "profile", moduleId: "company_profile", label: "Profil / Firma", icon: "◇" },
  { key: "team", moduleId: "team", label: "Mitarbeiter", icon: "◎" },
  { key: "access-codes", moduleId: "access_codes", label: "Freigabe-Codes", icon: "▣" },
  { key: "hotel-mode", moduleId: "hotel_mode", label: "Hotelmodus", icon: "⌂" },
  { key: "company-rides", moduleId: "company_rides", label: "Firmenfahrten", icon: "⎔" },
  { key: "recurring", moduleId: "recurring_rides", label: "Serienfahrten", icon: "↻" },
  { key: "billing", moduleId: "billing", label: "Abrechnung", icon: "€" },
];

/** @param {string[]|undefined|null} panelModules — effektive Liste von /panel/v1/me */
export function filterNavItems(panelModules) {
  if (!Array.isArray(panelModules)) return [...PANEL_NAV_ITEMS];
  if (panelModules.length === 0) return [];
  const set = new Set(panelModules);
  return PANEL_NAV_ITEMS.filter((item) => set.has(item.moduleId));
}

/** Erste sichtbare Seite für initiales Routing */
export function firstNavKey(panelModules) {
  const items = filterNavItems(panelModules);
  return items[0]?.key ?? null;
}

/** @param {string[]|undefined|null} panelModules */
export function hasPanelModule(panelModules, moduleId) {
  if (!Array.isArray(panelModules)) return true;
  if (panelModules.length === 0) return false;
  return panelModules.includes(moduleId);
}
