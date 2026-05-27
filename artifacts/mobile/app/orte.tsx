import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import React, { useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import { accountSheetHeaderTitle } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? "";

type OrtCategoryIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type Kategorie = {
  id: string;
  label: string;
  icon: OrtCategoryIconName;
  color: string;
  bgColor: string;
  googleType: string;
  subfilter?: { id: string; label: string; keyword: string }[];
};

function OrtCategoryIcon({
  name,
  size,
  color,
}: {
  name: OrtCategoryIconName;
  size: number;
  color: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

const KATEGORIEN: Kategorie[] = [
  {
    id: "apotheke",
    label: "Apotheke",
    icon: "medical-bag",
    color: "#0F6E56",
    bgColor: "#E1F5EE",
    googleType: "pharmacy",
    subfilter: [
      { id: "alle", label: "Alle", keyword: "Apotheke" },
      { id: "notfall", label: "Notapotheke", keyword: "Notapotheke" },
    ],
  },
  {
    id: "arzt",
    label: "Arzt",
    icon: "stethoscope",
    color: "#A32D2D",
    bgColor: "#FCEBEB",
    googleType: "doctor",
    subfilter: [
      { id: "alle", label: "Alle Ärzte", keyword: "Arzt" },
      { id: "hausarzt", label: "Hausarzt", keyword: "Hausarzt" },
      { id: "zahnarzt", label: "Zahnarzt", keyword: "Zahnarzt" },
      { id: "orthopäde", label: "Orthopäde", keyword: "Orthopäde" },
      { id: "augenarzt", label: "Augenarzt", keyword: "Augenarzt" },
      { id: "hno", label: "HNO", keyword: "HNO" },
      { id: "kardiologe", label: "Kardiologe", keyword: "Kardiologe" },
      { id: "neurologe", label: "Neurologe", keyword: "Neurologe" },
      { id: "psychiater", label: "Psychiater", keyword: "Psychiater" },
    ],
  },
  {
    id: "bahnhof",
    label: "Bahnhof",
    icon: "train",
    color: "#185FA5",
    bgColor: "#E6F1FB",
    googleType: "train_station",
  },
  {
    id: "flughafen",
    label: "Flughafen",
    icon: "airplane",
    color: "#534AB7",
    bgColor: "#EEEDFE",
    googleType: "airport",
  },
  {
    id: "hotel",
    label: "Hotel",
    icon: "bed-double-outline",
    color: "#854F0B",
    bgColor: "#FAEEDA",
    googleType: "lodging",
  },
  {
    id: "krankenhaus",
    label: "Krankenhaus",
    icon: "hospital-building",
    color: "#A32D2D",
    bgColor: "#FCEBEB",
    googleType: "hospital",
  },
];

type PlaceResult = {
  place_id: string;
  name: string;
  vicinity: string;
  distanceKm?: number;
  opening_hours?: { open_now: boolean };
  types: string[];
  geometry?: { location: { lat: number; lng: number } };
};

const FALLBACK_CENTER = { lat: 48.7758, lng: 9.1829 };
/** Ab 2 Zeichen Freitext → Text Search (z. B. „Flughafen München“), sonst Nearby nach Standort. */
const ORTE_TEXT_SEARCH_MIN_LEN = 2;
const ORTE_SEARCH_DEBOUNCE_MS = 400;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function withDistanceFrom(
  places: PlaceResult[],
  origin: { lat: number; lng: number },
): PlaceResult[] {
  return places
    .map((p) => {
      const g = p.geometry?.location;
      const distanceKm = g != null ? haversineKm(origin.lat, origin.lng, g.lat, g.lng) : undefined;
      return { ...p, distanceKm };
    })
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
}

function normalizePlaceResult(raw: Record<string, unknown>): PlaceResult {
  const geometry = raw.geometry as PlaceResult["geometry"] | undefined;
  const opening = raw.opening_hours as PlaceResult["opening_hours"] | undefined;
  return {
    place_id: String(raw.place_id ?? ""),
    name: String(raw.name ?? ""),
    vicinity: String(raw.vicinity ?? raw.formatted_address ?? ""),
    opening_hours: opening,
    types: Array.isArray(raw.types) ? (raw.types as string[]) : [],
    geometry,
  };
}

function subKeywordFor(kat: Kategorie, selectedSub: string): string {
  return kat.subfilter?.find((s) => s.id === selectedSub)?.keyword ?? kat.label;
}

/** Not-/Bereitschaftsapotheken (keine normale Tagesapotheke ohne Notdienst im Namen). */
const NOTAPOTHEKE_NAME_RE =
  /not\s*apo|notapotheke|not[\s-]?dienst|nacht\s*apo|bereitschafts?\s*apo|apo.*notdienst/i;

function isLikelyNotapotheke(place: PlaceResult): boolean {
  return NOTAPOTHEKE_NAME_RE.test(place.name);
}

function isNotapothekeSubfilter(kat: Kategorie, subId: string): boolean {
  return kat.id === "apotheke" && subId === "notfall";
}

function filterPlacesForSub(kat: Kategorie, subId: string, places: PlaceResult[]): PlaceResult[] {
  if (!isNotapothekeSubfilter(kat, subId)) return places;
  return places.filter(
    (p) => p.opening_hours?.open_now === true && isLikelyNotapotheke(p),
  );
}

/** Freitext mit Kategorie kombinieren, wenn nur Stadt/Ort getippt wurde (z. B. „München“ → „Flughafen München“). */
function buildTextSearchQuery(kat: Kategorie, subKeyword: string, qTrim: string): string {
  const qLower = qTrim.toLowerCase();
  const hasCategory =
    qLower.includes(kat.label.toLowerCase()) ||
    (subKeyword !== kat.label && qLower.includes(subKeyword.toLowerCase()));
  if (hasCategory) return qTrim;
  return `${subKeyword} ${qTrim}`.trim();
}

export default function OrteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const [selectedKat, setSelectedKat] = useState<Kategorie | null>(null);
  const [selectedSub, setSelectedSub] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } finally {
        setLocationReady(true);
      }
    })();
  }, []);

  const searchPlaces = useCallback(async (kat: Kategorie, subKeyword: string, q: string, subId = "alle") => {
    if (!GOOGLE_PLACES_API_KEY) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const qTrim = q.trim();
      const origin = userLocation ?? FALLBACK_CENTER;
      const { lat, lng } = origin;
      const notapothekeOnly = isNotapothekeSubfilter(kat, subId);
      const openNowParam = notapothekeOnly ? "&opennow=true" : "";
      let url: string;

      if (qTrim.length >= ORTE_TEXT_SEARCH_MIN_LEN) {
        const textQuery = buildTextSearchQuery(kat, subKeyword, qTrim);
        url =
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}` +
          `&type=${kat.googleType}&language=de&location=${lat},${lng}&radius=500000` +
          `${openNowParam}&key=${GOOGLE_PLACES_API_KEY}`;
      } else {
        const keyword = qTrim || subKeyword;
        const rankByDistance = userLocation != null;
        url = rankByDistance
          ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=${kat.googleType}&keyword=${encodeURIComponent(keyword)}&language=de${openNowParam}&key=${GOOGLE_PLACES_API_KEY}`
          : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=${kat.googleType}&keyword=${encodeURIComponent(keyword)}&language=de${openNowParam}&key=${GOOGLE_PLACES_API_KEY}`;
      }

      const res = await fetch(url);
      const data = (await res.json()) as { results?: Record<string, unknown>[]; status?: string };
      const raw = data.results ?? [];
      const places = filterPlacesForSub(
        kat,
        subId,
        raw.map(normalizePlaceResult).filter((p) => p.place_id.length > 0),
      );
      setResults(withDistanceFrom(places, origin));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  React.useEffect(() => {
    if (!locationReady || !selectedKat) return;
    searchPlaces(selectedKat, subKeywordFor(selectedKat, selectedSub), search, selectedSub);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur neu laden wenn Standort bereit/wechselt
  }, [locationReady, userLocation]);

  React.useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const selectKat = (kat: Kategorie) => {
    setSelectedKat(kat);
    setSelectedSub("alle");
    setSearch("");
    setResults([]);
    if (locationReady) {
      searchPlaces(kat, kat.subfilter?.[0]?.keyword ?? kat.label, "", "alle");
    }
  };

  const selectSub = (sub: { id: string; keyword: string }) => {
    setSelectedSub(sub.id);
    if (selectedKat) searchPlaces(selectedKat, sub.keyword, search, sub.id);
  };

  const runSearchForKat = useCallback(
    (kat: Kategorie, subId: string, q: string, debounceMs = 0) => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      const subKw = subKeywordFor(kat, subId);
      if (debounceMs <= 0) {
        void searchPlaces(kat, subKw, q, subId);
        return;
      }
      searchDebounceRef.current = setTimeout(() => {
        searchDebounceRef.current = null;
        void searchPlaces(kat, subKw, q, subId);
      }, debounceMs);
    },
    [searchPlaces],
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (!selectedKat) return;
    const debounce = text.trim().length >= ORTE_TEXT_SEARCH_MIN_LEN ? ORTE_SEARCH_DEBOUNCE_MS : 0;
    runSearchForKat(selectedKat, selectedSub, text, debounce);
  };

  const handleSelect = (place: PlaceResult) => {
    router.push({
      pathname: "/orte-detail",
      params: {
        placeId: place.place_id,
        placeName: place.name,
        placeAddr: place.vicinity,
        katColor: selectedKat?.color ?? "#333",
        katBg: selectedKat?.bgColor ?? "#F2F2F7",
        katIcon: selectedKat?.icon ?? "map-marker-outline",
      },
    } as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            borderBottomColor: HOME_SHEET_RIM,
            backgroundColor: HOME_SHEET_PANEL,
          },
        ]}
      >
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Orte</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) }]}
      >

        {/* Kategorien */}
        <View style={styles.katGrid}>
          {KATEGORIEN.map((kat) => {
            const isActive = selectedKat?.id === kat.id;
            return (
              <Pressable
                key={kat.id}
                style={[styles.katCard, { backgroundColor: isActive ? kat.bgColor : colors.card, borderColor: isActive ? kat.color : colors.border }]}
                onPress={() => selectKat(kat)}
              >
                <View style={[styles.katIcon, { backgroundColor: kat.bgColor }]}>
                  <OrtCategoryIcon name={kat.icon} size={rs(22)} color={kat.color} />
                </View>
                <Text style={[styles.katLabel, { color: isActive ? kat.color : colors.foreground }]}>{kat.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Subfilter */}
        {selectedKat?.subfilter && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subRow}>
            {selectedKat.subfilter.map((sub) => {
              const isActive = selectedSub === sub.id;
              return (
                <Pressable
                  key={sub.id}
                  style={[styles.subBtn, { backgroundColor: isActive ? "#EF1D26" : colors.card, borderColor: isActive ? "#EF1D26" : colors.border }]}
                  onPress={() => selectSub(sub)}
                >
                  <Text style={[styles.subBtnText, { color: isActive ? "#fff" : colors.foreground }]}>{sub.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Suchfeld */}
        {selectedKat && (
          <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Stadt oder Name, z. B. München …"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={handleSearch}
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearch("");
                  if (selectedKat) runSearchForKat(selectedKat, selectedSub, "");
                }}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        )}

        {/* Ergebnisse */}
        {loading && <ActivityIndicator color="#EF1D26" style={{ marginTop: 24 }} />}
        {!loading && results.map((place) => {
          const isOpen = place.opening_hours?.open_now;
          return (
            <Pressable
              key={place.place_id}
              style={[styles.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelect(place)}
            >
              <View style={[styles.resultIcon, { backgroundColor: selectedKat?.bgColor ?? "#F2F2F7" }]}>
                <OrtCategoryIcon
                  name={selectedKat?.icon ?? "map-marker-outline"}
                  size={rs(18)}
                  color={selectedKat?.color ?? "#333"}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.resultName, { color: colors.foreground }]} numberOfLines={1}>{place.name}</Text>
                <Text style={[styles.resultAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {place.vicinity}
                  {place.distanceKm != null ? ` · ${place.distanceKm.toFixed(1)} km` : ""}
                </Text>
              </View>
              {place.opening_hours != null && (
                <Text style={[styles.openBadge, { color: isOpen ? "#0F6E56" : "#A32D2D", backgroundColor: isOpen ? "#E1F5EE" : "#FCEBEB" }]}>
                  {isOpen ? "Offen" : "Geschl."}
                </Text>
              )}
              <Feather name="arrow-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
            </Pressable>
          );
        })}

        {!loading && selectedKat && results.length === 0 && (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            {isNotapothekeSubfilter(selectedKat, selectedSub)
              ? "Keine geöffnete Notapotheke in der Nähe gefunden."
              : "Keine Ergebnisse gefunden."}
          </Text>
        )}

        {!selectedKat && (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Wähle eine Kategorie aus.</Text>
        )}

      </ScrollView>

      <BottomTabBar active="orte" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: accountSheetHeaderTitle,
  scroll: {
    paddingHorizontal: rs(16),
    paddingTop: rs(20),
    gap: rs(10),
  },
  katGrid: { flexDirection: "row", flexWrap: "wrap", gap: rs(10) },
  katCard: { width: "30%", alignItems: "center", gap: rs(8), padding: rs(12), borderRadius: rs(12), borderWidth: 1 },
  katIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: "center", justifyContent: "center" },
  katLabel: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", textAlign: "center" },
  subRow: { flexDirection: "row", gap: rs(8), paddingBottom: rs(2) },
  subBtn: { paddingHorizontal: rs(14), paddingVertical: rs(6), borderRadius: rs(20), borderWidth: 1 },
  subBtnText: { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: rs(8), paddingHorizontal: rs(12), paddingVertical: rs(10), borderRadius: rs(12), borderWidth: 1 },
  searchInput: { flex: 1, fontSize: rf(14), fontFamily: "Inter_400Regular", padding: 0 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: rs(12), padding: rs(12), borderRadius: rs(12), borderWidth: 1 },
  resultIcon: { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  resultName: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  resultAddr: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 2 },
  openBadge: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  empty: { textAlign: "center", marginTop: rs(32), fontSize: rf(14), fontFamily: "Inter_400Regular" },
});
