import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getApiBaseUrl } from "@/utils/apiBase";
import { sendDriverLocation as socketSendDriver } from "@/utils/socket";
import { getRouteWithSteps, type RouteStep } from "@/utils/routing";

const API_BASE = getApiBaseUrl();

const NIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function maneuverIcon(instruction: string): string {
  const i = (instruction ?? "").toLowerCase();
  if (i.includes("rechts")) return "arrow-right-top";
  if (i.includes("links")) return "arrow-left-top";
  if (i.includes("geradeaus") || i.includes("weiter")) return "arrow-up";
  if (i.includes("wenden")) return "u-turn-right";
  if (i.includes("kreisverkehr")) return "rotate-right";
  if (i.includes("ziel")) return "map-marker-check";
  return "arrow-up";
}

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtArrival(remainingMin: number): string {
  const d = new Date(Date.now() + remainingMin * 60000);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function trySpeak(text: string, enabled: boolean) {
  if (!enabled || Platform.OS === "web") return;
  try {
    Speech.stop();
    Speech.speak(text, { language: "de-DE", rate: 0.95 });
  } catch (_) {}
}

function WebFallback() {
  return (
    <View style={styles.webFallback}>
      <Feather name="map" size={56} color="#DC2626" />
      <Text style={styles.webTitle}>Navigation</Text>
      <Text style={styles.webBody}>
        Die In-App-Navigation ist nur in der Expo Go App verfügbar.
      </Text>
      <Pressable style={styles.webBtn} onPress={() => router.back()}>
        <Text style={styles.webBtnText}>Zurück</Text>
      </Pressable>
    </View>
  );
}

export default function DriverNavigationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    rideId: string; phase: string;
    fromLat: string; fromLon: string; fromName: string;
    toLat: string; toLon: string; toName: string;
    customerName: string;
    pickupLat: string; pickupLon: string; pickupName: string;
    destLat: string; destLon: string; destName: string;
    estimatedFare: string;
    paymentMethod: string;
  }>();

  const phase = params.phase ?? "pickup";
  const isPickupPhase = phase === "pickup";

  const fromLat = parseFloat(params.fromLat ?? "0");
  const fromLon = parseFloat(params.fromLon ?? "0");
  const toLat   = parseFloat(params.toLat ?? "0");
  const toLon   = parseFloat(params.toLon ?? "0");

  const pickupLat  = parseFloat(params.pickupLat ?? params.toLat ?? "0");
  const pickupLon  = parseFloat(params.pickupLon ?? params.toLon ?? "0");
  const pickupName = params.pickupName ?? params.toName ?? "Abholort";
  const destLat    = parseFloat(params.destLat ?? "0");
  const destLon    = parseFloat(params.destLon ?? "0");
  const destName   = params.destName ?? params.toName ?? "Ziel";
  const estimatedFare = parseFloat(params.estimatedFare ?? "0");

  const mapRef  = useRef<MapView>(null);
  const mapReady = useRef(false);

  const [polyline, setPolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [steps, setSteps]       = useState<RouteStep[]>([]);
  const [stepIdx, setStepIdx]   = useState(0);
  const prevStepIdx = useRef(-1);

  const [initialDistM, setInitialDistM] = useState(0);
  const [initialEtaMin, setInitialEtaMin] = useState(0);
  const [remainingDistM, setRemainingDistM] = useState(0);
  const [remainingMin, setRemainingMin]     = useState(0);

  const [driverLat, setDriverLat] = useState(fromLat || 48.7394);
  const [driverLon, setDriverLon] = useState(fromLon || 9.3114);

  // pickup-phase sequential state: false = show "Angekommen", true = show "Fahrt beginnen"
  const [hasArrived, setHasArrived] = useState(false);

  // Ton Ein/Aus
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundRef = useRef(true);

  // fare modal
  const [showFareModal, setShowFareModal] = useState(false);
  const [fareInput, setFareInput] = useState(
    estimatedFare > 0 ? estimatedFare.toFixed(2).replace(".", ",") : "0,00"
  );

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const native = Platform.OS !== "web";
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.82, duration: 700, useNativeDriver: native }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const fitRoute = useCallback((coords: { latitude: number; longitude: number }[]) => {
    if (coords.length < 2 || !mapReady.current) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 180, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
  }, []);

  // Load route
  useEffect(() => {
    if (Platform.OS === "web") return;
    const fLat = fromLat || driverLat;
    const fLon = fromLon || driverLon;
    const tLat = toLat || pickupLat;
    const tLon = toLon || pickupLon;
    if (!fLat || !fLon || !tLat || !tLon) return;

    getRouteWithSteps(
      { lat: fLat, lon: fLon, displayName: params.fromName ?? "Start" },
      { lat: tLat, lon: tLon, displayName: params.toName ?? "Ziel" }
    )
      .then((result) => {
        const coords = (result.polyline ?? []).map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
        setPolyline(coords);
        setSteps(result.steps);
        const distM  = (result.distanceKm ?? 0) * 1000;
        const etaMin = result.durationMinutes ?? 0;
        setInitialDistM(distM);
        setInitialEtaMin(etaMin);
        setRemainingDistM(distM);
        setRemainingMin(etaMin);
        // No auto-speak on load — only speak on explicit button presses
        if (mapReady.current && coords.length > 1) setTimeout(() => fitRoute(coords), 400);
      })
      .catch(() => {});
  }, [fromLat, fromLon, toLat, toLon, pickupLat, pickupLon]);

  // Speak on step change — skip "Fahrt beginnen" (depart) instructions
  useEffect(() => {
    if (!steps.length || stepIdx === prevStepIdx.current) return;
    prevStepIdx.current = stepIdx;
    const instr = steps[stepIdx]?.instruction ?? "";
    if (instr && instr !== "Fahrt beginnen") trySpeak(instr, soundRef.current);
  }, [stepIdx, steps]);

  const distToPickup = haversine(driverLat, driverLon, pickupLat, pickupLon);
  const isNearPickup = distToPickup < 300;

  // API helpers
  const patchStatus = async (newStatus: string, finalFare?: number) => {
    if (!params.rideId) return;
    await fetch(`${API_BASE}/rides/${params.rideId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, ...(finalFare != null ? { finalFare } : {}) }),
    }).catch(() => {});
  };

  const handleAngekommen = async () => {
    await patchStatus("driver_waiting");
    trySpeak("Angekommen. Bitte Fahrt starten wenn der Kunde eingestiegen ist.", soundRef.current);
    setHasArrived(true);   // ← stay on screen, button changes to "Fahrt beginnen"
  };

  const handleFahrtBeginnen = async () => {
    await patchStatus("passenger_onboard");
    trySpeak("Fahrt gestartet. Navigiere zum Ziel.", soundRef.current);
    router.replace({
      pathname: "/driver/navigation" as "/driver/navigation",
      params: {
        rideId: params.rideId,
        phase: "driving",
        fromLat: String(pickupLat),
        fromLon: String(pickupLon),
        fromName: pickupName,
        toLat: String(destLat),
        toLon: String(destLon),
        toName: destName,
        customerName: params.customerName,
        pickupLat: String(pickupLat),
        pickupLon: String(pickupLon),
        pickupName,
        destLat: String(destLat),
        destLon: String(destLon),
        destName,
        estimatedFare: String(estimatedFare),
        paymentMethod: params.paymentMethod ?? "",
      },
    });
  };

  const handleFahrtBeenden = () => {
    trySpeak("Fahrt wird beendet.", soundRef.current);
    setFareInput("0,00");
    setShowFareModal(true);
  };

  const handleConfirmFare = async () => {
    const parsed = parseFloat(fareInput.replace(",", "."));
    const fare   = isNaN(parsed) ? estimatedFare : parsed;
    await patchStatus("completed", fare);
    setShowFareModal(false);
    trySpeak("Fahrt abgeschlossen. Vielen Dank.", soundRef.current);
    router.back();
  };

  // GPS tracking
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setDriverLat(latitude);
          setDriverLon(longitude);

          const endLat = toLat || pickupLat || fromLat;
          const endLon = toLon || pickupLon || fromLon;
          const remDist = haversine(latitude, longitude, endLat, endLon);
          setRemainingDistM(remDist);
          if (initialDistM > 0) {
            const frac = Math.min(remDist / initialDistM, 1);
            setRemainingMin(Math.max(1, Math.round(initialEtaMin * frac)));
          }

          // Advance step
          if (steps.length > 0) {
            let minD = Infinity, closest = stepIdx;
            steps.forEach((s, i) => {
              if (i < stepIdx) return;
              const d = haversine(latitude, longitude, s.lat, s.lon);
              if (d < minD) { minD = d; closest = i; }
            });
            if (minD < 30 && closest < steps.length - 1) {
              setStepIdx(Math.min(closest + 1, steps.length - 1));
            }
          }

          socketSendDriver(latitude, longitude);
          if (params.rideId) {
            fetch(`${API_BASE}/rides/${params.rideId}/driver-location`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat: latitude, lon: longitude }),
            }).catch(() => {});
          }

          mapRef.current?.animateCamera({
            center: { latitude, longitude },
            heading: loc.coords.heading ?? 0,
            zoom: 17, pitch: 45,
          });
        }
      );
    })();
    return () => { sub?.remove(); };
  }, [steps, stepIdx, params.rideId, initialDistM, initialEtaMin, toLat, toLon, pickupLat, pickupLon, fromLat, fromLon]);

  const handleMapReady = useCallback(() => {
    mapReady.current = true;
    const fLat = fromLat || driverLat;
    const fLon = fromLon || driverLon;
    setTimeout(() => {
      mapRef.current?.animateCamera({ center: { latitude: fLat, longitude: fLon }, zoom: 14, pitch: 0 });
    }, 200);
    if (polyline.length > 1) setTimeout(() => fitRoute(polyline), 600);
  }, [fromLat, fromLon, driverLat, driverLon, polyline, fitRoute]);

  if (Platform.OS === "web") return <WebFallback />;

  const currentStep = steps[stepIdx] ?? null;
  const nextStep    = steps[stepIdx + 1] ?? null;
  const streetName  = currentStep?.instruction ?? (isPickupPhase ? pickupName : destName);
  /** Nach „Angekommen“: grüner Balken wie Google Maps — Fokus auf Start, nicht auf ersten Routing-Schritt. */
  const topPrimaryText =
    isPickupPhase && hasArrived ? "Fahrt beginnen" : streetName;
  const topDistanceText =
    isPickupPhase && hasArrived && distToPickup > 0
      ? `in ${fmtDist(distToPickup)}`
      : currentStep && currentStep.distanceM > 0
        ? `in ${fmtDist(currentStep.distanceM)}`
        : "";

  // ─── Bottom action button ───────────────────────────────────────────────────
  let actionBtn: React.ReactNode;
  if (isPickupPhase) {
    if (!hasArrived) {
      // Step 1: "Angekommen" — locked until < 300m
      const locked = !isNearPickup;
      actionBtn = (
        <Pressable
          style={[styles.actionBtn, locked ? styles.actionBtnGray : styles.actionBtnGreen]}
          onPress={locked ? undefined : handleAngekommen}
          disabled={locked}
        >
          <Feather name="map-pin" size={20} color={locked ? "#9CA3AF" : "#fff"} />
          <View>
            <Text style={[styles.actionBtnText, locked && styles.actionBtnTextGray]}>Angekommen</Text>
            {locked && (
              <Text style={styles.actionBtnSub}>{fmtDist(distToPickup)} bis Abholort</Text>
            )}
          </View>
        </Pressable>
      );
    } else {
      // Step 2: "Fahrt beginnen" — unlocked after Angekommen
      actionBtn = (
        <Pressable style={[styles.actionBtn, styles.actionBtnBlue]} onPress={handleFahrtBeginnen}>
          <MaterialCommunityIcons name="car-arrow-right" size={22} color="#fff" />
          <Text style={styles.actionBtnText}>Fahrt beginnen</Text>
        </Pressable>
      );
    }
  } else {
    // Driving phase: "Fahrt beenden"
    actionBtn = (
      <Pressable style={[styles.actionBtn, styles.actionBtnRed]} onPress={handleFahrtBeenden}>
        <Feather name="flag" size={20} color="#fff" />
        <Text style={styles.actionBtnText}>Fahrt beenden</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={NIGHT_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled
        pitchEnabled
        onMapReady={handleMapReady}
        initialRegion={{
          latitude: fromLat || 48.7394,
          longitude: fromLon || 9.3114,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        <Marker
          coordinate={{ latitude: toLat || pickupLat || fromLat, longitude: toLon || pickupLon || fromLon }}
          pinColor={isPickupPhase ? "#22C55E" : "#DC2626"}
        />
        {polyline.length > 1 && (
          <Polyline
            coordinates={polyline}
            strokeColor="#4285F4"
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {/* Top instruction card — Google Maps green */}
      <View style={[styles.topWrapper, { paddingTop: Platform.OS === "ios" ? insets.top : 36 }]}>
        <View style={styles.topCard}>
          <View style={styles.topMain}>
            <Animated.View style={{ opacity: pulseAnim }}>
              <MaterialCommunityIcons name={maneuverIcon(currentStep?.instruction ?? "") as any} size={26} color="#fff" />
            </Animated.View>
            <View style={styles.topText}>
              <Text style={styles.topLabel}>Richtung</Text>
              <Text style={styles.topStreet} numberOfLines={2}>{topPrimaryText}</Text>
              {topDistanceText ? <Text style={styles.topDist}>{topDistanceText}</Text> : null}
            </View>
          </View>
        </View>
        {nextStep && (
          <View style={styles.dannCard}>
            <MaterialCommunityIcons name={maneuverIcon(nextStep.instruction) as any} size={15} color="#374151" />
            <Text style={styles.dannText} numberOfLines={1}>Dann: {nextStep.instruction}</Text>
          </View>
        )}
      </View>

      {/* Floating button column — right side above black bar */}
      <View style={{ position: "absolute", right: 12, bottom: insets.bottom + 230, gap: 10 }}>
        <Pressable
          style={styles.compassBtn}
          onPress={() => mapRef.current?.animateCamera({ center: { latitude: driverLat, longitude: driverLon }, zoom: 17 })}
        >
          <Feather name="navigation" size={18} color="#1B6B3A" />
        </Pressable>
        <Pressable
          style={styles.compassBtn}
          onPress={() => fitRoute(polyline)}
        >
          <Feather name="maximize-2" size={18} color="#1B6B3A" />
        </Pressable>
        <Pressable
          style={[styles.compassBtn, !soundEnabled && { backgroundColor: "#3A1010", borderColor: "#DC2626", borderWidth: 1 }]}
          onPress={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            soundRef.current = next;
            if (!next) { try { Speech.stop(); } catch (_) {} }
          }}
        >
          <Feather name={soundEnabled ? "volume-2" : "volume-x"} size={18} color={soundEnabled ? "#1B6B3A" : "#DC2626"} />
        </Pressable>
      </View>

      {/* Bottom bar — dark Google Maps style */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* ETA + customer info row */}
        <View style={styles.etaRow}>
          <View style={styles.etaBlock}>
            <Text style={styles.etaMin}>{remainingMin > 0 ? `${remainingMin} min` : "—"}</Text>
            <Text style={styles.etaDetail}>
              {remainingDistM > 0 ? fmtDist(remainingDistM) : "—"}
              {remainingMin > 0 ? ` · ${fmtArrival(remainingMin)}` : ""}
            </Text>
          </View>
          <View style={styles.etaCustomerBlock}>
            {params.customerName ? (
              <Text style={styles.etaCustomer} numberOfLines={1}>{params.customerName}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <MaterialCommunityIcons
                name={
                  (params.paymentMethod ?? "").startsWith("Krankenkasse")
                    ? "ticket-percent-outline"
                    : (params.paymentMethod ?? "").toLowerCase().includes("karte") ||
                        (params.paymentMethod ?? "").toLowerCase().includes("kreditkarte")
                      ? "credit-card-outline"
                      : (params.paymentMethod ?? "").toLowerCase().includes("paypal")
                        ? "cellphone"
                        : "cash"
                }
                size={15}
                color={(params.paymentMethod ?? "").startsWith("Krankenkasse") ? "#60A5FA" : "#94A3B8"}
              />
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#94A3B8" }} numberOfLines={1}>
                {(params.paymentMethod ?? "").startsWith("Krankenkasse") ? "Krankenkasse" : (params.paymentMethod || "Bar")}
              </Text>
            </View>
          </View>
        </View>
        {/* Full-width action button */}
        <View style={styles.actionBtnWrapper}>
          {actionBtn}
        </View>

        {/* Stornieren */}
        <Pressable
          onPress={() =>
            Alert.alert(
              "Fahrt abbrechen?",
              "Möchtest du diesen Auftrag wirklich stornieren?",
              [
                { text: "Nein, weiter fahren", style: "cancel" },
                {
                  text: "Ja, stornieren",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await fetch(`${API_BASE}/rides/${params.rideId}/driver-cancel`, { method: "POST" });
                    } catch (_) {}
                    router.back();
                  },
                },
              ]
            )
          }
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 10,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: pressed ? "#3F1515" : "#2A1010",
            borderWidth: 1,
            borderColor: "#DC2626",
          })}
        >
          <Feather name="x-circle" size={18} color="#DC2626" />
          <Text style={{ color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 15 }}>
            Fahrt stornieren
          </Text>
        </Pressable>
      </View>

      {/* Fare Modal */}
      <Modal visible={showFareModal} transparent animationType="slide" onRequestClose={() => setShowFareModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Feather name="flag" size={26} color="#22C55E" />
              <Text style={styles.modalTitle}>Fahrt beenden</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Fahrtpreis für <Text style={{ fontFamily: "Inter_700Bold" }}>{params.customerName ?? "Kunden"}</Text> bestätigen:
            </Text>
            <View style={styles.fareBox}>
              <Text style={styles.fareBoxLabel}>Fahrtpreis (€)</Text>
              <TextInput
                style={styles.fareInput}
                value={fareInput}
                onChangeText={setFareInput}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowFareModal(false)}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={handleConfirmFare}>
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Abschicken</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#242f3e" },

  /* Top card */
  topWrapper: { position: "absolute", top: 0, left: 0, right: 0 },
  topCard: { backgroundColor: "#1B6B3A", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6 },
  topMain: { flexDirection: "row", alignItems: "center", gap: 10 },
  topText: { flex: 1 },
  topLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  topStreet: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 21 },
  topDist: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 1 },
  compassBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  dannCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  dannText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", flex: 1 },

  /* Bottom bar */
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#1C1C1E",
    flexDirection: "column",
    paddingTop: 14, paddingHorizontal: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
  },
  etaRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  etaBlock: { minWidth: 90 },
  etaMin: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#4ADE80", lineHeight: 34 },
  etaDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  etaCustomerBlock: { flex: 1, justifyContent: "center" },
  etaCustomer: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  etaDest: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 3 },
  etaPickupDist: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#4ADE80", marginTop: 4 },
  actionBtnWrapper: { width: "100%" },

  /* Action buttons */
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 8,
  },
  actionBtnGreen: { backgroundColor: "#22C55E" },
  actionBtnGray:  { backgroundColor: "#374151" },
  actionBtnBlue:  { backgroundColor: "#2563EB" },
  actionBtnRed:   { backgroundColor: "#EA4335" },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  actionBtnTextGray: { color: "#9CA3AF" },
  actionBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 1 },

  /* Fare Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 26, paddingBottom: 34, gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827" },
  modalSubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280" },
  fareBox: {
    backgroundColor: "#F9FAFB", borderRadius: 14,
    borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 16, paddingVertical: 4,
  },
  fareBoxLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 8 },
  fareInput: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#111827", paddingVertical: 8 },
  fareHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9CA3AF", textAlign: "center" },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingVertical: 14, alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  submitBtn: {
    flex: 2, backgroundColor: "#22C55E", borderRadius: 14,
    paddingVertical: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Web fallback */
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16, backgroundColor: "#fff" },
  webTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#1F2937" },
  webBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center" },
  webBtn: { backgroundColor: "#DC2626", borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  webBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
