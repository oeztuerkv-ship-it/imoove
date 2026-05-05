/** Partner-Panel-JWT: strikt getrennt vom Admin-Panel (`onroda_admin_token`). */
const PARTNER_JWT_KEY = "onroda_partner_token";
const LEGACY_PARTNER_JWT_KEY = "onrodaPanelJwt";

export function getPartnerJwt() {
  try {
    const next = localStorage.getItem(PARTNER_JWT_KEY);
    if (next) return next;
    const legacy = localStorage.getItem(LEGACY_PARTNER_JWT_KEY);
    if (legacy) {
      localStorage.setItem(PARTNER_JWT_KEY, legacy);
      localStorage.removeItem(LEGACY_PARTNER_JWT_KEY);
      return legacy;
    }
    return "";
  } catch {
    return "";
  }
}

export function setPartnerJwt(jwt) {
  try {
    if (jwt) {
      localStorage.setItem(PARTNER_JWT_KEY, jwt);
      localStorage.removeItem(LEGACY_PARTNER_JWT_KEY);
    } else {
      localStorage.removeItem(PARTNER_JWT_KEY);
      localStorage.removeItem(LEGACY_PARTNER_JWT_KEY);
    }
  } catch {
    /* ignore */
  }
}
