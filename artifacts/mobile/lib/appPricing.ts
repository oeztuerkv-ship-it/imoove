import { getApiBaseUrl } from "@/utils/apiBase";

export type AppPricingResponse = {
  ok?: boolean;
  version?: number;
  updatedAt?: string | null;
  pricingMode?: string;
  tariffs?: Record<string, unknown>;
  infoDe?: string;
};

/** Öffentlich: `GET /api/app/pricing` — gleiche Tarifquelle wie `app/config`, ohne Admin-Geheimnisse. */
export async function fetchAppPricing(): Promise<AppPricingResponse | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/app/pricing`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as AppPricingResponse;
    return j && j.ok ? j : null;
  } catch {
    return null;
  }
}
