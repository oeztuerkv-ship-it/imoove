import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GeoLocation } from "@/utils/routing";

export const FAVORITES_STORAGE_KEY = "@Onroda_search_favorites_v1";
export const MAX_FAVORITES_STORED = 5;
export const MAX_CUSTOM_FAVORITES = 3;

export type SearchFavorite = {
  id: string;
  label: string;
  location: GeoLocation;
};

/** Feste Lieblingsziele (POI) — immer verfügbar auf Festpreis & Suche. */
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

/** Eigene Favoriten (max. 3) + feste POI-Presets für Ziel-Auswahl. */
export function mergeDestinationQuickPicks(customFavorites: SearchFavorite[]): SearchFavorite[] {
  const custom = customFavorites.slice(0, MAX_CUSTOM_FAVORITES);
  return [...FIXPRICE_DESTINATION_PRESETS, ...custom];
}
