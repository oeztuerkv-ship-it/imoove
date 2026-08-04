import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  EMPTY_SELECTED_ADDRESS,
  geoLocationToSelectedAddress,
  type SelectedAddress,
} from "@/components/booking/selectedAddress";
import { searchLocation, type GeoLocation } from "@/utils/routing";

type Props = {
  label: string;
  placeholder: string;
  value: SelectedAddress;
  onChange: (next: SelectedAddress) => void;
};

/**
 * Photon-Autocomplete für Fahrer-Sheets (Funk) — liefert lat/lon bei Auswahl.
 */
export function DriverSheetAddressField({ label, placeholder, value, onChange }: Props) {
  const [query, setQuery] = useState(value.fullName || value.name);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeoLocation[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickedRef = useRef(Boolean(value.fullName && Number.isFinite(value.lat) && Number.isFinite(value.lon)));

  useEffect(() => {
    if (!focused) {
      setQuery(value.fullName || value.name || "");
    }
  }, [focused, value.fullName, value.name]);

  useEffect(() => {
    if (!focused) return;
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(() => {
      void searchLocation(q)
        .then((locs) => setResults(locs.slice(0, 6)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, focused]);

  const pick = (loc: GeoLocation) => {
    const sel = geoLocationToSelectedAddress(loc);
    pickedRef.current = true;
    onChange(sel);
    setQuery(sel.fullName);
    setResults([]);
    setFocused(false);
  };

  const clear = () => {
    pickedRef.current = false;
    onChange(EMPTY_SELECTED_ADDRESS);
    setQuery("");
    setResults([]);
  };

  const hasCoords =
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon) &&
    (value.lat !== 0 || value.lon !== 0) &&
    Boolean((value.fullName || value.name).trim());

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => {
            pickedRef.current = false;
            setQuery(t);
            if (!t.trim()) onChange(EMPTY_SELECTED_ADDRESS);
          }}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // kurze Verzögerung, damit Tippen auf Ergebnis greift
            setTimeout(() => setFocused(false), 180);
          }}
        />
        {hasCoords ? (
          <Pressable onPress={clear} hitSlop={8} accessibilityLabel="Adresse löschen">
            <Feather name="x-circle" size={18} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </View>
      {hasCoords ? (
        <Text style={styles.coordsOk}>
          Ort gewählt ({value.lat.toFixed(5)}, {value.lon.toFixed(5)})
        </Text>
      ) : (
        <Text style={styles.coordsHint}>Bitte Adresse aus der Vorschlagsliste wählen</Text>
      )}
      {focused && query.trim().length >= 2 ? (
        <View style={styles.results}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#6B7280" />
              <Text style={styles.loadingText}>Suche …</Text>
            </View>
          ) : results.length === 0 ? (
            <Text style={styles.empty}>Keine Treffer</Text>
          ) : (
            results.map((loc) => {
              const sel = geoLocationToSelectedAddress(loc);
              return (
                <Pressable
                  key={`${loc.lat},${loc.lon},${loc.displayName}`}
                  style={styles.resultRow}
                  onPress={() => pick(loc)}
                >
                  <Feather name="map-pin" size={16} color="#EF1D26" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {sel.name}
                    </Text>
                    <Text style={styles.resultSub} numberOfLines={1}>
                      {sel.subline || sel.fullName}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

export function selectedAddressHasCoords(a: SelectedAddress): boolean {
  return (
    Boolean((a.fullName || a.name).trim()) &&
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lon) &&
    !(a.lat === 0 && a.lon === 0)
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  inputRowFocused: { borderColor: "#EF1D26" },
  input: {
    flex: 1,
    paddingVertical: 11,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#111",
  },
  coordsOk: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#15803D",
  },
  coordsHint: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  results: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#6B7280" },
  empty: {
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  resultTitle: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#111" },
  resultSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#6B7280", marginTop: 1 },
});
