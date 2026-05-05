import { isLikelyAdminSessionJwt } from "./unsafeJwtPayload.js";

const SESSION_KEY = "onroda_admin_token";
const LEGACY_SESSION_KEY = "onrodaAdminSessionToken";

export function getAdminSessionToken() {
  try {
    const next = localStorage.getItem(SESSION_KEY) || "";
    const migrated =
      next ||
      (() => {
        const legacy = localStorage.getItem(LEGACY_SESSION_KEY) || "";
        if (!legacy) return "";
        localStorage.setItem(SESSION_KEY, legacy);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        return legacy;
      })();
    if (migrated && !isLikelyAdminSessionJwt(migrated)) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
      return "";
    }
    return migrated;
  } catch {
    return "";
  }
}

export function setAdminSessionToken(token) {
  try {
    const t = typeof token === "string" ? token.trim() : "";
    if (t) {
      if (!isLikelyAdminSessionJwt(t)) {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        return;
      }
      localStorage.setItem(SESSION_KEY, t);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isAdminSessionConfigured() {
  return getAdminSessionToken().length > 0;
}

export function adminApiHeaders(extra = {}) {
  const h = { ...extra };
  const token = getAdminSessionToken();
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/**
 * `fetch` für `/api/admin/*`: baut `Headers`, setzt danach immer die aktuelle Sitzung
 * (`Authorization: Bearer <JWT>`). Verhindert, dass ein leeres/älteres `Authorization`
 * aus `init.headers` die Session überschreibt und vermeidet Abweichungen zu reinem Plain-Object-Merge.
 */
export function adminFetch(input, init = {}) {
  const headers = new Headers(init.headers == null ? undefined : init.headers);
  const token = getAdminSessionToken().trim();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
