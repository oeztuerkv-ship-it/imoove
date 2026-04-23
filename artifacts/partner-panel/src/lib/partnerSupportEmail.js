/**
 * Zentrale Kontakt-E-Mail für Mailto-Links im Partner-Panel (Stammdaten-Hinweise, …).
 * Optional: VITE_PARTNER_SUPPORT_EMAIL in .env (Build-Zeit).
 */
export const PARTNER_SUPPORT_EMAIL =
  (typeof import.meta !== "undefined" && String(import.meta.env?.VITE_PARTNER_SUPPORT_EMAIL ?? "").trim()) ||
  "onroda@mail.de";
