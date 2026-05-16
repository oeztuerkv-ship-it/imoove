import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBar } from "@/components/BottomTabBar";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Kategorie = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  bgColor: string;
  googleType: string;
  subfilter?: { id: string; label: string; keyword: string }[];
};

const KATEGORIEN: Kategorie[] = [
  {
    id: "apotheke",
    label: "Apotheke",
    icon: "plus-circle",
    color: "#0F6E56",
    bgColor: "#E1F5EE",
    googleType: "pharmacy",
    subfilter: [
      { id: "alle", label: "Alle", keyword: "Apotheke" },
      { id: "notfall", label: "Notapotheke", keyword: "Notapotheke" },
      { id: "nacht", label: "Nachtapotheke", keyword: "Nachtapotheke" },
    ],
  },
  {
    id: "arzt",
    label: "Arzt",
    icon: "activity",
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
    icon: "map",
    color: "#185FA5",
    bgColor: "#E6F1FB",
    googleType: "train_station",
  },
  {
    id: "flughafen",
    label: "Flughafen",
    icon: "navigation",
    color: "#534AB7",
    bgColor: "#EEEDFE",
    googleType: "airport",
  },
  {
    id: "hotel",
    label: "Hotel",
    icon: "home",
    color: "#854F0B",
    bgColor: "#FAEEDA",
    googleType: "lodging",
  },
  {
    id: "krankenhaus",
    label: "Krankenhaus",
    icon: "heart",
    color: "#A32D2D",
    bgColor: "#FCEBEB",
    googleType: "hospital",
  },
];

type PlaceResult = {
  place_id: string;
  name: string;
  vicinity: string;
  distance?: number;
  opening_hours?: { open_now: boolean };
  types: string[];
};

export default function OrteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedKat, setSelectedKat] = useState<Kategorie | null>(null);
  const [selectedSub, setSelectedSub] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [notfallOnly, setNotfallOnly] = useState(false);

  const searchPlaces = useCallback(async (kat: Kategorie, subKeyword: string, q: string) => {
    setLoading(true);
    try {
      const keyword = q.trim() || subKeyword;
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=48.7758,9.1829&radius=5000&type=${kat.googleType}&keyword=${encodeURIComponent(keyword)}&language=de&key=${GOOGLE_PLACES_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectKat = (kat: Kategorie) => {
    setSelectedKat(kat);
    setSelectedSub("alle");
    setSearch("");
    setResults([]);
    searchPlaces(kat, kat.subfilter?.[0]?.keyword ?? kat.label, "");
  };

  const selectSub = (sub: { id: string; keyword: string }) => {
    setSelectedSub(sub.id);
    if (selectedKat) searchPlaces(selectedKat, sub.keyword, search);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (selectedKat) searchPlaces(selectedKat, selectedKat.label, text);
  };

  const handleSelect = (place: PlaceResult) => {
    router.push(`/?dest=${encodeURIComponent(place.name + ", " + place.vicinity)}` as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Orte</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

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
                  <Feather name={kat.icon} size={20} color={kat.color} />
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
              placeholder="Name oder Adresse suchen..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={handleSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(""); if (selectedKat) searchPlaces(selectedKat, selectedKat.label, ""); }}>
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
                <Feather name={selectedKat?.icon ?? "map-pin"} size={18} color={selectedKat?.color ?? "#333"} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.resultName, { color: colors.foreground }]} numberOfLines={1}>{place.name}</Text>
                <Text style={[styles.resultAddr, { color: colors.mutedForeground }]} numberOfLines={1}>{place.vicinity}</Text>
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
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Keine Ergebnisse gefunden.</Text>
        )}

        {!selectedKat && (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Wähle eine Kategorie aus.</Text>
        )}

      </ScrollView>

      <BottomTabBar active="orte" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: rs(16), paddingBottom: rs(12), borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  katGrid: { flexDirection: "row", flexWrap: "wrap", gap: rs(10), padding: rs(16) },
  katCard: { width: "30%", alignItems: "center", gap: rs(8), padding: rs(12), borderRadius: rs(12), borderWidth: 1 },
  katIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: "center", justifyContent: "center" },
  katLabel: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", textAlign: "center" },
  subRow: { flexDirection: "row", gap: rs(8), paddingHorizontal: rs(16), paddingBottom: rs(12) },
  subBtn: { paddingHorizontal: rs(14), paddingVertical: rs(6), borderRadius: rs(20), borderWidth: 1 },
  subBtnText: { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: rs(8), marginHorizontal: rs(16), marginBottom: rs(12), paddingHorizontal: rs(12), paddingVertical: rs(10), borderRadius: rs(12), borderWidth: 1 },
  searchInput: { flex: 1, fontSize: rf(14), fontFamily: "Inter_400Regular", padding: 0 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: rs(12), marginHorizontal: rs(16), marginBottom: rs(8), padding: rs(12), borderRadius: rs(12), borderWidth: 1 },
  resultIcon: { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  resultName: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  resultAddr: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 2 },
  openBadge: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  empty: { textAlign: "center", marginTop: rs(32), fontSize: rf(14), fontFamily: "Inter_400Regular" },
});
