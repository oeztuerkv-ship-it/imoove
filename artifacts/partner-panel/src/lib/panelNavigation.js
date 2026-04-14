/**
 * Navigation ↔ Panel-Module (IDs müssen mit API `domain/panelModules` übereinstimmen).
 * @type {readonly { key: string; moduleId: string; label: string; icon: string; requiredPermission?: string }[]}
 */
export const PANEL_NAV_ITEMS = [
  { key: "overview", moduleId: "overview", label: "Start", icon: "◫" },
  { key: "rides-mine", moduleId: "rides_list", label: "Meine Fahrten", icon: "☰", requiredPermission: "rides.read" },
  { key: "rides-new", moduleId: "rides_create", label: "Neue Fahrt", icon: "+", requiredPermission: "rides.create" },
  { key: "medical-round", moduleId: "rides_create", label: "Patient H/R", icon: "⇄", requiredPermission: "rides.create" },
  { key: "rides-history", moduleId: "rides_list", label: "Mein Verlauf", icon: "↺", requiredPermission: "rides.read" },
  { key: "profile", moduleId: "company_profile", label: "Meine Firma", icon: "◇" },
  { key: "team", moduleId: "team", label: "Mitarbeiter", icon: "◎", requiredPermission: "users.read" },
  { key: "access-codes", moduleId: "access_codes", label: "Freigabe-Codes", icon: "▣", requiredPermission: "access_codes.read" },
  { key: "hotel-mode", moduleId: "hotel_mode", label: "Hotelmodus", icon: "⌂", requiredPermission: "rides.create" },
  { key: "company-rides", moduleId: "company_rides", label: "Firmenfahrten", icon: "⎔", requiredPermission: "rides.read" },
  { key: "recurring", moduleId: "recurring_rides", label: "Serienfahrten", icon: "↻", requiredPermission: "rides.create" },
  { key: "billing", moduleId: "billing", label: "Abrechnung", icon: "€", requiredPermission: "rides.read" },
  { key: "fleet", moduleId: "taxi_fleet", label: "Flotte & Fahrer", icon: "⛯", requiredPermission: "fleet.read" },
  { key: "settings", moduleId: "company_profile", label: "Einstellungen", icon: "⚙", requiredPermission: "self.change_password" },
];

/** @param {string[]|undefined|null} panelModules — effektive Liste von /panel/v1/me */
export function filterNavItems(panelModules, permissions) {
  const permSet = new Set(Array.isArray(permissions) ? permissions : []);
  const hasPerm = (item) => !item.requiredPermission || permSet.has(item.requiredPermission);
  if (!Array.isArray(panelModules)) return PANEL_NAV_ITEMS.filter(hasPerm);
  if (panelModules.length === 0) return [];
  const set = new Set(panelModules);
  return PANEL_NAV_ITEMS.filter((item) => set.has(item.moduleId) && hasPerm(item));
}

/** Erste sichtbare Seite für initiales Routing */
export function firstNavKey(panelModules, permissions) {
  const items = filterNavItems(panelModules, permissions);
  return items[0]?.key ?? null;
}

/** @param {string[]|undefined|null} panelModules */
export function hasPanelModule(panelModules, moduleId) {
  if (!Array.isArray(panelModules)) return true;
  if (panelModules.length === 0) return false;
  return panelModules.includes(moduleId);
}
