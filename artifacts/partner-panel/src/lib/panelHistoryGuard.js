/**
 * Partner-Panel: Browser-Zurück darf nicht auf die Admin-Konsole (admin.onroda.de /partners/) führen.
 * Die Partner-SPA nutzt kein React Router — interne Navigation wird per history.pushState gespiegelt.
 */

const PROD_PANEL_HOST = "panel.onroda.de";
const PROD_ADMIN_HOST = "admin.onroda.de";

export function getPartnerPanelOrigin() {
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === PROD_PANEL_HOST || h === "localhost" || h === "127.0.0.1") {
      return window.location.origin;
    }
  }
  return `https://${PROD_PANEL_HOST}`;
}

/** Admin-Operator-Konsole (nicht Partner-Arbeitsplatz). */
export function isAdminOperatorHost(hostname) {
  const h = (hostname ?? "").toLowerCase();
  if (h === PROD_ADMIN_HOST) return true;
  return false;
}

/** Pfad der Admin-SPA (Vite base /partners/). */
export function isAdminSpaPath(pathname) {
  const p = pathname ?? "";
  return p === "/partners" || p.startsWith("/partners/");
}

/**
 * Partner-Bundle läuft fälschlich auf Admin-Host oder /partners-Pfad (Nginx/History-Fehler).
 */
export function isWrongPortalLocation(loc = window.location) {
  const host = loc.hostname?.toLowerCase() ?? "";
  if (isAdminOperatorHost(host)) return true;
  if (isAdminSpaPath(loc.pathname) && host !== PROD_PANEL_HOST) {
    return true;
  }
  return false;
}

function redirectToPartnerHome() {
  const target = `${getPartnerPanelOrigin()}/`;
  if (window.location.href !== target) {
    window.location.replace(target);
  }
}

/**
 * @param {{ onPopModule?: (moduleKey: string) => void; readModuleFromUrl?: () => string | null }} [opts]
 * @returns {() => void} cleanup
 */
export function installPartnerPanelHistoryGuard(opts = {}) {
  if (typeof window === "undefined") return () => {};

  const { onPopModule, readModuleFromUrl } = opts;

  if (isWrongPortalLocation()) {
    redirectToPartnerHome();
    return () => {};
  }

  function seedHistoryBarrier() {
    try {
      const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const module = readModuleFromUrl?.() ?? null;
      window.history.replaceState({ onrodaPanel: true, module }, "", url);
      window.history.pushState({ onrodaPanel: true, barrier: true }, "", url);
    } catch {
      /* ignore */
    }
  }

  function onPopState() {
    if (isWrongPortalLocation()) {
      redirectToPartnerHome();
      return;
    }
    const mod = readModuleFromUrl?.();
    if (mod && typeof onPopModule === "function") {
      onPopModule(mod);
      return;
    }
    if (window.history.state?.barrier) {
      seedHistoryBarrier();
    }
  }

  window.addEventListener("popstate", onPopState);
  seedHistoryBarrier();

  return () => {
    window.removeEventListener("popstate", onPopState);
  };
}

/**
 * Interne Modul-Navigation in die Browser-History schreiben (Zurück = vorheriger Partner-Screen).
 * @param {string} moduleKey
 * @param {{ paramName?: string; omitWhen?: string }} [options]
 */
export function pushPartnerPanelModuleHistory(moduleKey, options = {}) {
  if (typeof window === "undefined") return;
  const paramName = options.paramName ?? "taxiModule";
  const omitWhen = options.omitWhen ?? "dashboard";
  try {
    const u = new URL(window.location.href);
    if (!moduleKey || moduleKey === omitWhen) {
      u.searchParams.delete(paramName);
    } else {
      u.searchParams.set(paramName, moduleKey);
    }
    const next = `${u.pathname}${u.search}${u.hash}`;
    window.history.pushState({ onrodaPanel: true, module: moduleKey }, "", next);
  } catch {
    /* ignore */
  }
}
