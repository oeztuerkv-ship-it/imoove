import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GeoLocation } from "@/utils/routing";

export const FAVORITES_STORAGE_KEY = "@Onroda_search_favorites_v1";
export const MAX_FAVORITES_STORED = 5;

export type SearchFavorite = {
  id: string;
  label: string;
  location: GeoLocation;
};

/** Feste häufige Ziele (POI) — Festpreis-Screen „Häufige Ziele“. */
export const FIXPRICE_DESTINATION_PRESETS: SearchFavorite[] = [
  {
    id: "preset-str-airport",
    label: "Flughafen",
    location: {
      displayName: "Terminalstraße 1, 70629 Stuttgart",
      lat: 48.689978,
      lon: 9.221945,
      city: "Stuttgart",
    },
  },
  {
    id: "preset-str-messe",
    label: "Messe",
    location: {
      displayName: "Messepiazza 1, 70629 Stuttgart",
      lat: 48.79525,
      lon: 9.2312,
      city: "Stuttgart",
    },
  },
  {
    id: "preset-str-hbf",
    label: "Hauptbahnhof",
    location: {
      displayName: "Bahnhofplatz 1, 70173 Stuttgart",
      lat: 48.783889,
      lon: 9.181667,
      city: "Stuttgart",
    },
  },
];

function isSearchFavorite(x: unknown): x is SearchFavorite {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as SearchFavorite).id === "string" &&
    typeof (x as SearchFavorite).label === "string" &&
    typeof (x as SearchFavorite).location === "object" &&
    (x as SearchFavorite).location !== null &&
    typeof (x as SearchFavorite).location.displayName === "string"
  );
}

export async function loadSearchFavorites(): Promise<SearchFavorite[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSearchFavorite).slice(0, MAX_FAVORITES_STORED);
  } catch {
    return [];
  }
}

export function createSearchFavoriteId(): string {
  return `fav-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveSearchFavorites(favorites: SearchFavorite[]): Promise<SearchFavorite[]> {
  const capped = favorites.filter(isSearchFavorite).slice(0, MAX_FAVORITES_STORED);
  await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(capped));
  return capped;
}

export async function appendSearchFavorite(input: {
  label: string;
  location: GeoLocation;
}): Promise<{ ok: true; favorites: SearchFavorite[] } | { ok: false; error: "limit_reached" }> {
  const existing = await loadSearchFavorites();
  if (existing.length >= MAX_FAVORITES_STORED) {
    return { ok: false, error: "limit_reached" };
  }
  const next: SearchFavorite = {
    id: createSearchFavoriteId(),
    label: input.label.trim() || input.location.displayName.split(",")[0]?.trim() || "Favorit",
    location: input.location,
  };
  const favorites = await saveSearchFavorites([...existing, next]);
  return { ok: true, favorites };
}
