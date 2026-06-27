/** Server-seitiger Google-Places-Key (Web Service). Keine iOS-App-Einschränkung — nur API-Restrictions. */
export function getGooglePlacesApiKey(): string | null {
  const key = (process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_SERVER_API_KEY ?? "").trim();
  return key.length > 0 ? key : null;
}

/**
 * Distance Matrix für preisrelevante km — bewusst **GOOGLE_MAPS_SERVER_API_KEY zuerst**,
 * damit ein separater Matrix-Key nicht vom Places-Key überdeckt wird.
 */
export function getGoogleDistanceMatrixApiKey(): string | null {
  const key = (process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  return key.length > 0 ? key : null;
}

export type GoogleDistanceMatrixKeySource =
  | "GOOGLE_MAPS_SERVER_API_KEY"
  | "GOOGLE_PLACES_API_KEY"
  | "none";

/** Nur Metadaten fürs Logging — kein Key-Leak. */
export function getGoogleDistanceMatrixKeySource(): GoogleDistanceMatrixKeySource {
  if ((process.env.GOOGLE_MAPS_SERVER_API_KEY ?? "").trim()) return "GOOGLE_MAPS_SERVER_API_KEY";
  if ((process.env.GOOGLE_PLACES_API_KEY ?? "").trim()) return "GOOGLE_PLACES_API_KEY";
  return "none";
}

export type GooglePlacesProxyResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function fetchGooglePlacesApi(urlPathAndQuery: string): Promise<GooglePlacesProxyResponse> {
  const key = getGooglePlacesApiKey();
  if (!key) {
    return { ok: false, status: 503, body: { error: "places_not_configured", status: "REQUEST_DENIED" } };
  }
  const sep = urlPathAndQuery.includes("?") ? "&" : "?";
  const url = `https://maps.googleapis.com/maps/api/place/${urlPathAndQuery}${sep}key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    body = { status: "UNKNOWN_ERROR", error_message: "invalid_google_response" };
  }
  return { ok: res.ok, status: res.status, body };
}
