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
