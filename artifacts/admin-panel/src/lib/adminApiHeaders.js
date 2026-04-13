/**
 * Superadmin-API (`/api/admin/*` mit API_BASE = https://api.onroda.de/api):
 * statischer Bearer aus dem Vite-Build — kein Login-Formular wie beim Partner-Panel.
 *
 * Build/Deploy: VITE_ADMIN_API_BEARER_TOKEN = gleicher Wert wie ADMIN_API_BEARER_TOKEN auf der API.
 */
const BEARER = (import.meta.env.VITE_ADMIN_API_BEARER_TOKEN ?? "").trim();
const SESSION_KEY = "onrodaAdminSessionToken";

export function getAdminSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function setAdminSessionToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isAdminBearerConfigured() {
  return BEARER.length > 0 || getAdminSessionToken().length > 0;
}

export function adminApiHeaders(extra = {}) {
  const h = { ...extra };
  const token = getAdminSessionToken() || BEARER;
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}
