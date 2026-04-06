import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_ORIGIN, useRide } from "@/context/RideContext";
import { useColors } from "@/hooks/useColors";
import { type GeoLocation, searchLocation } from "@/utils/routing";

const RADIUS = 10;

function shortPlace(displayName: string) {
  const p = displayName.split(",");
  return (p[0] ?? displayName).trim() || "—";
}

export default function FahrtReservierenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { origin, destination, setOrigin, setDestination } = useRide();

  const [pickupQuery, setPickupQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [pickupResolved, setPickupResolved] = useState<GeoLocation | null>(null);
  const [destResolved, setDestResolved] = useState<GeoLocation | null>(null);

  const [pickupResults, setPickupResults] = useState<GeoLocation[]>([]);
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [destLoading, setDestLoading] = useState(false);
  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const seedFromContext = useCallback(() => {
    setPickupQuery(shortPlace(origin.displayName));
    setPickupResolved(origin);
    if (destination) {
      setDestQuery(shortPlace(destination.displayName));
      setDestResolved(destination);
    } else {
      setDestQuery("");
      setDestResolved(null);
    }
    setPickupResults([]);
    setDestResults([]);
  }, [origin, destination]);

  useFocusEffect(
    useCallback(() => {
      seedFromContext();
    }, [seedFromContext]),
  );

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardInset(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardInset(0);
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  /* Abholung: Bias Richtung gewähltem Ziel (falls vorhanden). */
  useEffect(() => {
    if (pickupQuery.length < 2) {
      setPickupResults([]);
      return;
    }
    if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    pickupDebounceRef.current = setTimeout(async () => {
      setPickupLoading(true);
      try {
        const biasLoc = destResolved ?? destination;
        const bias = biasLoc ? { lat: biasLoc.lat, lon: biasLoc.lon } : undefined;
        const locs = await searchLocation(pickupQuery, bias);
        setPickupResults(locs);
      } catch {
        setPickupResults([]);
      } finally {
        setPickupLoading(false);
      }
    }, 320);
    return () => {
      if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    };
  }, [pickupQuery, destResolved, destination]);

  /* Ziel: regionaler Bias nach Abholung. */
  useEffect(() => {
    if (destQuery.length < 2) {
      setDestResults([]);
      return;
    }
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(async () => {
      setDestLoading(true);
      try {
        const bias = pickupResolved ? { lat: pickupResolved.lat, lon: pickupResolved.lon } : { lat: origin.lat, lon: origin.lon };
        const locs = await searchLocation(destQuery, bias);
        setDestResults(locs);
      } catch {
        setDestResults([]);
      } finally {
        setDestLoading(false);
      }
    }, 320);
    return () => {
      if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    };
  }, [destQuery, pickupResolved, origin.lat, origin.lon]);

  const pickPickup = useCallback((loc: GeoLocation) => {
    setPickupResolved(loc);
    setPickupQuery(shortPlace(loc.displayName));
    setPickupResults([]);
    Haptics.selectionAsync();
  }, []);

  const pickDest = useCallback((loc: GeoLocation) => {
    setDestResolved(loc);
    setDestQuery(shortPlace(loc.displayName));
    setDestResults([]);
    Haptics.selectionAsync();
  }, []);

  const clearPickup = useCallback(() => {
    setPickupQuery("");
    setPickupResolved(null);
    setPickupResults([]);
    setOrigin(DEFAULT_ORIGIN);
    Haptics.selectionAsync();
  }, [setOrigin]);

  const clearDest = useCallback(() => {
    setDestQuery("");
    setDestResolved(null);
    setDestResults([]);
    setDestination(null);
    Haptics.selectionAsync();
  }, [setDestination]);

  const canProceed = pickupResolved != null && destResolved != null;

  const handleUseCurrentLocation = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Standort", "Bitte erlaube den Standortzugriff in den Einstellungen.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
        const resp = await fetch(url, {
          headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" },
        });
        if (!resp.ok) throw new Error();
        const data = (await resp.json()) as { display_name?: string };
        const line = data.display_name?.split(",").slice(0, 2).join(",").trim();
        const label = line || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        const loc: GeoLocation = { lat, lon, displayName: label };
        setPickupQuery(shortPlace(label));
        setPickupResolved(loc);
        setOrigin(loc);
        setPickupResults([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        const label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        const loc: GeoLocation = { lat, lon, displayName: label };
        setPickupQuery(label);
        setPickupResolved(loc);
        setOrigin(loc);
        setPickupResults([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("Standort", "Der aktuelle Standort konnte nicht ermittelt werden.");
    } finally {
      setGpsLoading(false);
    }
  }, [setOrigin]);

  const goNext = useCallback(async () => {
    if (!pickupResolved || !destResolved) return;
    setSubmitLoading(true);
    try {
      setOrigin(pickupResolved);
      setDestination(destResolved);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queueMicrotask(() => {
        router.push("/reserve-ride");
      });
    } finally {
      setSubmitLoading(false);
    }
  }, [pickupResolved, destResolved, setOrigin, setDestination]);

  const handleAbbrechen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const bottomPad = Platform.OS === "ios" ? insets.bottom : Math.max(insets.bottom, 12);
  /** Abstand zwischen „Weiter“ und Tastatur (zusätzlich zu Safe Area / KAV). */
  const footerKeyboardGap = keyboardInset > 0 ? 20 : 0;
  const scrollExtraBottom = keyboardInset > 0 ? 32 : 0;

  const primary = colors.primary;
  const borderActive = primary;
  const disabledBg = "#D4D4D4";
  const disabledText = "#737373";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: "#FFFFFF", paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Pressable onPress={handleAbbrechen} hitSlop={12} style={styles.headerSide}>
          <Text style={[styles.headerAbbrechen, { color: primary }]}>Abbrechen</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.titleFrame}>
            <Text style={[styles.headerTitle, { color: primary }]} numberOfLines={2}>
              Abholung planen
            </Text>
          </View>
          <Text style={[styles.headerStep, { color: colors.mutedForeground }]}>Schritt 1 von 4</Text>
        </View>
        <Pressable
          onPress={() => {
            if (!canProceed || submitLoading) return;
            void goNext();
          }}
          hitSlop={12}
          style={styles.headerSideRight}
          disabled={!canProceed || submitLoading}
        >
          <Feather
            name="arrow-right"
            size={24}
            color={!canProceed || submitLoading ? colors.border : primary}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + scrollExtraBottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Abholadresse</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Adresse eingeben oder auswählen</Text>
        <View style={[styles.inputWrap, { borderColor: borderActive, backgroundColor: "#FFFFFF" }]}>
          <Feather name="map-pin" size={18} color={primary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={pickupQuery}
            onChangeText={(t) => {
              setPickupQuery(t);
              if (pickupResolved) {
                const prev = shortPlace(pickupResolved.displayName);
                if (t !== prev) {
                  setPickupResolved(null);
                  setOrigin(DEFAULT_ORIGIN);
                }
              }
            }}
            placeholder="Abholort eingeben"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            returnKeyType="search"
          />
          {(pickupQuery.length > 0 || pickupResolved != null) ? (
            <Pressable
              hitSlop={10}
              onPress={clearPickup}
              style={styles.clearBtn}
              accessibilityLabel="Abholadresse löschen"
            >
              <Feather name="x" size={17} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {pickupLoading ? <ActivityIndicator size="small" color={primary} /> : null}
        </View>

        {pickupResults.length > 0 ? (
          <View style={[styles.resultsBox, { borderColor: colors.border }]}>
            {pickupResults.map((loc, i) => (
              <Pressable
                key={`pu-${loc.lat}-${loc.lon}-${i}`}
                style={[
                  styles.resultRow,
                  { backgroundColor: "#FFFFFF" },
                  i < pickupResults.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => pickPickup(loc)}
              >
                <Feather name="map-pin" size={16} color={primary} />
                <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                  {loc.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={handleUseCurrentLocation}
          disabled={gpsLoading}
          style={styles.locationLinkRow}
          hitSlop={4}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color={primary} />
          ) : (
            <Feather name="navigation" size={16} color={primary} />
          )}
          <Text style={[styles.locationLink, { color: primary }]}>Aktuellen Standort verwenden</Text>
        </Pressable>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced, { color: colors.foreground }]}>
          Zieladresse
        </Text>
        <View style={[styles.inputWrap, { borderColor: borderActive, backgroundColor: "#FFFFFF" }]}>
          <Feather name="map-pin" size={18} color={primary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={destQuery}
            onChangeText={(t) => {
              setDestQuery(t);
              if (destResolved) {
                const prev = shortPlace(destResolved.displayName);
                if (t !== prev) setDestResolved(null);
              }
            }}
            placeholder="Ziel eingeben"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (canProceed) void goNext();
            }}
          />
          {(destQuery.length > 0 || destResolved != null) ? (
            <Pressable
              hitSlop={10}
              onPress={clearDest}
              style={styles.clearBtn}
              accessibilityLabel="Zieladresse löschen"
            >
              <Feather name="x" size={17} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {destLoading ? <ActivityIndicator size="small" color={primary} /> : null}
        </View>

        {destResults.length > 0 ? (
          <View style={[styles.resultsBox, { borderColor: colors.border }]}>
            {destResults.map((loc, i) => (
              <Pressable
                key={`de-${loc.lat}-${loc.lon}-${i}`}
                style={[
                  styles.resultRow,
                  { backgroundColor: "#FFFFFF" },
                  i < destResults.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => pickDest(loc)}
              >
                <Feather name="map-pin" size={16} color={primary} />
                <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                  {loc.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: bottomPad + 12 + footerKeyboardGap,
          },
        ]}
      >
        <Pressable
          onPress={() => void goNext()}
          disabled={!canProceed || submitLoading}
          style={[
            styles.weiterBtn,
            {
              backgroundColor: canProceed && !submitLoading ? primary : disabledBg,
            },
          ]}
        >
          {submitLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={[
                styles.weiterBtnText,
                { color: canProceed ? "#FFFFFF" : disabledText },
              ]}
            >
              Weiter
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
  },
  headerSide: { width: 88, justifyContent: "center" },
  headerSideRight: { width: 88, alignItems: "flex-end", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  titleFrame: {
    borderWidth: 2,
    borderColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "center",
    maxWidth: "92%",
  },
  headerAbbrechen: { fontSize: 17, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  headerStep: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },
  sectionTitleSpaced: { marginTop: 28 },
  hint: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 12 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 4,
  },
  inputIcon: { marginRight: 6 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 14,
  },
  clearBtn: { padding: 6 },
  resultsBox: {
    marginTop: 10,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  resultText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  locationLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  locationLink: { fontSize: 15, fontFamily: "Inter_500Medium" },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
  },
  weiterBtn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  weiterBtnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});
