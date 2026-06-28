import type { GeoLocation } from "@/utils/routing";

/** Nominatim-Rückwärtsgeocoding (GPS → Adresse). */
export async function reverseGeocodeCoords(lat: number, lon: number): Promise<GeoLocation> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error("reverse_failed");
    const data = (await resp.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    const a = data.address ?? {};
    const road = String(a.road ?? "").trim();
    const houseNumber = String(a.house_number ?? "").trim();
    const city = String(a.city ?? a.town ?? a.village ?? a.municipality ?? "").trim();
    const postcode = String(a.postcode ?? "").trim();
    const line1 = road ? `${road}${houseNumber ? ` ${houseNumber}` : ""}` : "";
    const displayName = line1
      ? `${line1}${postcode ? `, ${postcode}` : ""}${city ? ` ${city}` : ""}`.trim()
      : data.display_name?.split(",").slice(0, 3).join(", ").trim() || "Aktueller Standort";
    return {
      lat,
      lon,
      displayName,
      street: road || undefined,
      housenumber: houseNumber || undefined,
      city: city || undefined,
      postcode: postcode || undefined,
    };
  } catch {
    return { lat, lon, displayName: "Aktueller Standort" };
  }
}
