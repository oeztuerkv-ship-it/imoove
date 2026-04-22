/**
 * Admin: Partner-Panel-Module (`panel_modules`) strikt an `admin_companies.company_kind` koppeln.
 * Verhindert fachlich falsche Kombinationen (z. B. Hotelmodul bei Krankenkasse).
 *
 * **Quelle der Whitelist:** `allowedPanelModuleIdsForCompanyKind` in `./panelModules` (Runtime + Admin).
 *
 * **Abgleich:** Bei Anpassungen dieselbe Logik im Admin-Frontend pflegen:
 * `artifacts/admin-panel/src/lib/panelModulesByCompanyKind.js`
 */
import { allowedPanelModuleIdsForCompanyKind, type PanelModuleId } from "./panelModules";

export { allowedPanelModuleIdsForCompanyKind };

export function filterPanelModulesToCompanyKind(companyKind: string, modules: string[]): PanelModuleId[] {
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind);
  const out: PanelModuleId[] = [];
  const seen = new Set<string>();
  for (const id of modules) {
    if (typeof id !== "string") continue;
    const t = id.trim() as PanelModuleId;
    if (!t || seen.has(t)) continue;
    if (!allowed.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function forbiddenPanelModulesForCompanyKind(
  companyKind: string,
  modules: string[],
): PanelModuleId[] {
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind);
  const bad: PanelModuleId[] = [];
  const seen = new Set<string>();
  for (const id of modules) {
    if (typeof id !== "string") continue;
    const t = id.trim() as PanelModuleId;
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (!allowed.has(t)) bad.push(t);
  }
  return bad;
}
