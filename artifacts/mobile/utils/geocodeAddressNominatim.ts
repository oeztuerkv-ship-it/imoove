/** Forward-Geocoding (DE) für private Notiz → In-App-Navi. */
export type GeocodedPoint = { lat: number; lon: number; displayName: string };

export async function geocodeAddressNominatim(query: string): Promise<GeocodedPoint | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const params = new URLSearchParams({
      q,
      format: "json",
      addressdetails: "0",
      limit: "1",
      countrycodes: "de",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const row = rows[0];
    if (!row?.lat || !row?.lon) return null;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      displayName: (row.display_name ?? q).trim() || q,
    };
  } catch {
    return null;
  }
}
