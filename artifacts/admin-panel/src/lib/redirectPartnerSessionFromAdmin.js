/**
 * Partner-JWT auf admin.onroda.de/partners/ → Partner-Portal (panel.onroda.de).
 * Verhindert „Zurück“ aus dem Partner-Panel in die Operator-Konsole für Mandanten-Nutzer.
 */
import { getAdminSessionToken } from "./adminApiHeaders.js";
import { readJwtPayloadUnsafe } from "./unsafeJwtPayload.js";

const PARTNER_JWT_KEY = "onroda_partner_token";
const PROD_PANEL_URL = "https://panel.onroda.de/";

function isLikelyPanelSessionJwt(jwt) {
  const p = readJwtPayloadUnsafe(jwt);
  return p?.kind === "panel";
}

function getPartnerJwt() {
  try {
    return (localStorage.getItem(PARTNER_JWT_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function panelHomeUrl() {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:5175/";
  }
  return PROD_PANEL_URL;
}

/**
 * Sofort aufrufen (main.jsx), bevor die Admin-SPA rendert.
 */
export function redirectPartnerSessionAwayFromAdmin() {
  if (typeof window === "undefined") return;
  const host = window.location.hostname?.toLowerCase() ?? "";
  if (host !== "admin.onroda.de") return;
  const path = window.location.pathname ?? "";
  if (!path.startsWith("/partners")) return;

  const partnerJwt = getPartnerJwt();
  if (!partnerJwt || !isLikelyPanelSessionJwt(partnerJwt)) return;

  const adminJwt = getAdminSessionToken();
  if (adminJwt) return;

  window.location.replace(panelHomeUrl());
}
