import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { useRide } from "@/context/RideContext";
import { useColors } from "@/hooks/useColors";
import { type GeoLocation, searchLocation } from "@/utils/routing";

async function reverseGeocodeLabel(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" },
    });
    if (!resp.ok) throw new Error();
    const data = (await resp.json()) as { display_name?: string };
    const line = data.display_name?.split(",").slice(0, 2).join(",").trim();
    return line || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

export default function FahrtReservierenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setOrigin, setDestination } = useRide();

  const [pickup, setPickup] = useState("");
  const [dest, setDest] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const canProceed = pickup.trim().length > 0 && dest.trim().length > 0;

  const handleUseCurrentLocation = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Standort", "Bitte erlaube den Standortzugriff in den Einstellungen.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const label = await reverseGeocodeLabel(pos.coords.latitude, pos.coords.longitude);
      setPickup(label);
      setOrigin({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        displayName: label,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Standort", "Der aktuelle Standort konnte nicht ermittelt werden.");
    } finally {
      setGpsLoading(false);
    }
  }, [setOrigin]);

  const goNext = useCallback(async () => {
    if (!canProceed) return;
    setSubmitLoading(true);
    try {
      const [pickResults, destResults] = await Promise.all([
        searchLocation(pickup.trim()),
        searchLocation(dest.trim()),
      ]);
      const pu = pickResults[0];
      const de = destResults[0];
      if (!pu || !de) {
        Alert.alert("Adresse", "Bitte gültige Abhol- und Zieladresse eingeben.");
        return;
      }
      setOrigin(pu);
      setDestination(de);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queueMicrotask(() => {
        router.push({ pathname: "/reserve-ride", params: { fromStep1: "1" } });
      });
    } catch {
      Alert.alert("Fehler", "Adressen konnten nicht geprüft werden. Bitte erneut versuchen.");
    } finally {
      setSubmitLoading(false);
    }
  }, [canProceed, pickup, dest, setOrigin, setDestination]);

  const handleAbbrechen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const bottomPad = Platform.OS === "ios" ? insets.bottom : Math.max(insets.bottom, 12);
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
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleAbbrechen} hitSlop={12} style={styles.headerSide}>
          <Text style={[styles.headerAbbrechen, { color: primary }]}>Abbrechen</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Fahrt reservieren</Text>
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Bereich 1 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Abholadresse</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Adresse eingeben oder auswählen</Text>
        <View style={[styles.inputWrap, { borderColor: borderActive, backgroundColor: "#FFFFFF" }]}>
          <Feather name="map-pin" size={18} color={primary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={pickup}
            onChangeText={setPickup}
            placeholder="Abholort eingeben"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>
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

        {/* Bereich 2 */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced, { color: colors.foreground }]}>
          Zieladresse
        </Text>
        <View style={[styles.inputWrap, { borderColor: borderActive, backgroundColor: "#FFFFFF" }]}>
          <Feather name="map-pin" size={18} color={primary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={dest}
            onChangeText={setDest}
            placeholder="Ziel eingeben"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canProceed) void goNext();
            }}
          />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: bottomPad + 12 }]}>
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
  headerCenter: { flex: 1, alignItems: "center" },
  headerAbbrechen: { fontSize: 17, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  headerStep: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
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
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 14,
  },
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
