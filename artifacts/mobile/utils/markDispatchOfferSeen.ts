import { getApiBaseUrl } from "./apiBase";

/**
 * Meldet offer_seen für eine Sofortfahrt im Markt (Fahrer hat Angebot im UI gesehen).
 */
export async function markDispatchOfferSeen(opts: {
  authToken: string;
  rideId: string;
}): Promise<void> {
  const token = opts.authToken.trim();
  const rideId = opts.rideId.trim();
  if (!token || !rideId) return;
  const API_BASE = getApiBaseUrl();
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/dispatch-offer-seen`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    /* best-effort */
  }
}
