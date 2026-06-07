import { getApiBaseUrl } from "@/utils/apiBase";

const LOG_TAG = "[GooglePlaces]";

export type GooglePlacesApiPayload = {
  results?: Record<string, unknown>[];
  result?: Record<string, unknown>;
  status?: string;
  error_message?: string;
};

export type GooglePlacesFetchResult =
  | { ok: true; data: GooglePlacesApiPayload }
  | { ok: false; error: string; userMessage: string; status?: number };

function placesUserMessage(status: string | undefined, errorMessage: string | undefined): string {
  if (status === "REQUEST_DENIED") {
    return (
      errorMessage?.trim() ||
      "Orte-Suche ist auf dem Server noch nicht freigeschaltet (Google Places API / Key)."
    );
  }
  if (status === "ZERO_RESULTS") return "Keine Treffer in der Nähe.";
  if (status === "OVER_QUERY_LIMIT") return "Orte-Suche vorübergehend nicht verfügbar. Bitte später erneut.";
  if (status === "INVALID_REQUEST") return "Suchanfrage ungültig.";
  return "Orte-Suche fehlgeschlagen. Bitte später erneut versuchen.";
}

async function fetchPlacesPath(pathWithQuery: string): Promise<GooglePlacesFetchResult> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    return {
      ok: false,
      error: "api_not_configured",
      userMessage: "API-Basis fehlt (EXPO_PUBLIC_API_URL).",
    };
  }
  const url = `${apiBase}${pathWithQuery}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(LOG_TAG, "network", { url, message });
    return { ok: false, error: "network_error", userMessage: "Netzwerkfehler bei der Ortssuche." };
  }
  const raw = await res.text();
  let data: GooglePlacesApiPayload = {};
  try {
    data = raw ? (JSON.parse(raw) as GooglePlacesApiPayload) : {};
  } catch {
    data = {};
  }
  const status = typeof data.status === "string" ? data.status : undefined;
  if (!res.ok || (status && status !== "OK" && status !== "ZERO_RESULTS")) {
    const errMsg = typeof data.error_message === "string" ? data.error_message : undefined;
    console.error(LOG_TAG, "api", { url, httpStatus: res.status, status, error_message: errMsg ?? null });
    return {
      ok: false,
      error: status ?? `http_${res.status}`,
      userMessage: placesUserMessage(status, errMsg),
      status: res.status,
    };
  }
  return { ok: true, data };
}

export async function fetchPlacesNearbySearch(params: {
  location: string;
  type: string;
  keyword?: string;
  rankByDistance?: boolean;
  radius?: number;
  openNow?: boolean;
}): Promise<GooglePlacesFetchResult> {
  const qs = new URLSearchParams({
    location: params.location,
    type: params.type,
    language: "de",
  });
  if (params.keyword?.trim()) qs.set("keyword", params.keyword.trim());
  if (params.rankByDistance) qs.set("rankby", "distance");
  else qs.set("radius", String(params.radius ?? 5000));
  if (params.openNow) qs.set("opennow", "true");
  return fetchPlacesPath(`/public/v1/places/nearbysearch?${qs.toString()}`);
}

export async function fetchPlacesTextSearch(params: {
  query: string;
  type: string;
  location: string;
  radius?: number;
  openNow?: boolean;
}): Promise<GooglePlacesFetchResult> {
  const qs = new URLSearchParams({
    query: params.query,
    type: params.type,
    location: params.location,
    radius: String(params.radius ?? 500000),
    language: "de",
  });
  if (params.openNow) qs.set("opennow", "true");
  return fetchPlacesPath(`/public/v1/places/textsearch?${qs.toString()}`);
}

export async function fetchPlaceDetails(placeId: string): Promise<GooglePlacesFetchResult> {
  const qs = new URLSearchParams({
    place_id: placeId,
    language: "de",
    fields: "name,formatted_address,formatted_phone_number,website,opening_hours,geometry,types",
  });
  return fetchPlacesPath(`/public/v1/places/details?${qs.toString()}`);
}
