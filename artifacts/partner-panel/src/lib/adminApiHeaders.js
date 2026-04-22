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
