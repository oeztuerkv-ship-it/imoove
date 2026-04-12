/**
 * Superadmin-API (`/admin/*`): optional Bearer aus Build-Env.
 * Setze lokal/prod: VITE_ADMIN_API_BEARER_TOKEN=<gleicher Wert wie ADMIN_API_BEARER_TOKEN auf der API>.
 */
const BEARER = (import.meta.env.VITE_ADMIN_API_BEARER_TOKEN ?? "").trim();

export function adminApiHeaders(extra = {}) {
  const h = { ...extra };
  if (BEARER) {
    h.Authorization = `Bearer ${BEARER}`;
  }
  return h;
}
