import { getApiBaseUrl } from "@/utils/apiBase";

const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

export async function releaseDispatchOffer(opts: {
  authToken: string;
  rideId: string;
}): Promise<{ ok: true; dispatchTier: string } | { ok: false; error: string }> {
  const tok = opts.authToken.trim();
  const rideId = opts.rideId.trim();
  if (!tok || !rideId) return { ok: false, error: "invalid_input" };
  try {
    const res = await fetch(
      `${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/release-dispatch-offer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
      },
    );
    const j = (await res.json().catch(() => ({}))) as { error?: string; dispatchTier?: string };
    if (!res.ok) return { ok: false, error: j.error || `http_${res.status}` };
    return { ok: true, dispatchTier: String(j.dispatchTier ?? "B") };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
