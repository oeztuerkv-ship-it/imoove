/**
 * EXPERIMENTELL / UNGETESTET — QA-Screen fuer das Google Navigation SDK.
 *
 * Kein Einstiegspunkt in der App verlinkt diesen Screen. Er existiert nur, um das
 * SDK auf einem echten Geraet manuell zu pruefen, bevor ueber eine Umstellung der
 * produktiven Fahrer-Navi entschieden wird. Nichts hier ersetzt `app/driver/navigation.tsx`.
 *
 * Voraussetzungen, bevor dieser Screen ueberhaupt startet:
 *  - EXPO_PUBLIC_ENABLE_GOOGLE_NAV=1 beim Build gesetzt (siehe app.config.js) — sonst ist
 *    das native Modul nicht eingebunden und der Import unten schlaegt fehl.
 *  - Neuer EAS-Dev-Build (kein OTA-Update moeglich, da natives Modul).
 *  - Google-Cloud-Projekt mit freigeschaltetem Navigation SDK + gueltigem API-Key
 *    (auf Mobility-/On-Demand-Zugang pruefen, ggf. Google-Sales noetig).
 *
 * Aufruf zum Testen (Deep Link, kein Button in der App):
 *   npx expo start --dev-client   →  im Geraet: onroda://driver/navigation-google-test
 */
import React, { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import {
  NavigationProvider,
  NavigationView,
  NavigationSessionStatus,
  TravelMode,
  useNavigation,
  type Waypoint,
} from "@googlemaps/react-native-navigation-sdk";

function GoogleNavTestInner() {
  const params = useLocalSearchParams<{ destLat?: string; destLon?: string }>();
  const { navigationController } = useNavigation();
  const [status, setStatus] = useState<string>("Nicht gestartet");

  const destLat = Number.parseFloat(params.destLat ?? "48.7758");
  const destLon = Number.parseFloat(params.destLon ?? "9.1829");

  const start = useCallback(async () => {
    try {
      setStatus("Berechtigungen pruefen…");
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setStatus("Standort-Berechtigung fehlt");
        return;
      }

      setStatus("Nutzungsbedingungen…");
      const accepted = await navigationController.showTermsAndConditionsDialog();
      if (!accepted) {
        setStatus("Nutzungsbedingungen abgelehnt");
        return;
      }

      setStatus("Initialisiere…");
      const initStatus = await navigationController.init();
      if (initStatus !== NavigationSessionStatus.OK) {
        setStatus(`Init fehlgeschlagen: ${initStatus}`);
        return;
      }

      const waypoint: Waypoint = {
        title: "Testziel",
        position: { lat: destLat, lng: destLon },
      };
      const routeStatus = await navigationController.setDestinations([waypoint], {
        routingOptions: { travelMode: TravelMode.DRIVING, avoidFerries: false, avoidTolls: false },
        displayOptions: { showDestinationMarkers: true, showStopSigns: true, showTrafficLights: true },
      });
      setStatus(`Route: ${routeStatus}`);
      await navigationController.startGuidance();
      setStatus("Navigation laeuft");
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [destLat, destLon, navigationController]);

  return (
    <View style={styles.container}>
      <NavigationView style={StyleSheet.absoluteFillObject} />
      <View style={styles.overlay}>
        <Text style={styles.status}>{status}</Text>
        <Pressable style={styles.button} onPress={() => void start()}>
          <Text style={styles.buttonText}>Google-Navi starten (Test)</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function GoogleNavTestScreen() {
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>Nur auf iOS/Android verfuegbar.</Text>
      </View>
    );
  }
  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: "Nutzungsbedingungen",
        companyName: "ONRODA",
        showOnlyDisclaimer: false,
      }}
    >
      <GoogleNavTestInner />
    </NavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 40,
    gap: 10,
  },
  status: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#15803D",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
