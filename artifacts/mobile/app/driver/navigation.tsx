import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DriverFareEntryLegalHints } from "@/components/DriverFareEntryLegalHints";
import { useDriver } from "@/context/DriverContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  requestForegroundPermissionsSafe,
  watchPositionSafe,
} from "@/utils/safeExpoLocation";
import {
  replaceDriverStackExclusive,
  setDriverNavigationPhaseParams,
} from "@/utils/driverNavigationRoute";
import { driverRideStatusUserMessage } from "@/utils/driverRideStatusErrors";
import {
  mergeRideChatMessages,
  parseRideChatUpdate,
  rideChatMessageId,
  type RideChatMessage,
  type RideChatSender,
} from "@/utils/rideChat";
import {
  connectToRide,
  disconnectSocket,
  sendDriverLocation as socketSendDriver,
  sendRideChat,
} from "@/utils/socket";
import {
  startDriverBackgroundLocation,
  stopDriverBackgroundLocation,
  isDriverBackgroundLocationRunning,
} from "@/utils/driverBackgroundLocation";
import { readFleetJwtForWsJoin } from "@/utils/wsJoinAuth";
import {
  logDriverNavigationMapEvent,
  logDriverNavigationOpen,
  logDriverNavigationRouteResult,
} from "@/utils/driverNavigationDiagnostics";
import { getRouteWithSteps, type RouteStep } from "@/utils/routing";
import {
  defaultFinalFareForDriverCompletion,
  driverMayBillPositiveFare,
  formatDriverFareInputDe,
  driverFinalFareNeedsAcknowledgement,
  validateDriverFinalFareInput,
} from "@/utils/driverRideCompletion";
import { formatWaitingChargeDe } from "@/utils/waitingTimeCharge";
import { computeDriverFareSettlementPreview } from "@/utils/driverFareSettlementPreview";
import { formatEuro } from "@/utils/fareCalculator";

const API_BASE = getApiBaseUrl();
const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const START_SLIDER_HANDLE = 52;
/** Unteres Panel während Zielfahrt: eingeklappt vs. hochgezogen (px Inhalt ohne Safe-Area). */
const DRIVE_SHEET_COLLAPSED_H = 96;
const DRIVE_SHEET_EXPANDED_H = 252;

async function fleetAuthHeadersJson(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

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
    vehicle?: string;
    vehicleClassMultiplier?: string;
    xlFixedSurchargeEur?: string;
    driverId: string;
    arrived?: string;
  }>();

  const { driverCancelRequest } = useRideRequests();
  const { driver, refreshEinsatzbereit } = useDriver();
  const stackCollapsedForRideRef = useRef<string | null>(null);

  const phase = params.phase ?? "pickup";
  const isPickupPhase = phase === "pickup";
  const isDrivingPhase = !isPickupPhase;

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

  useEffect(() => {
    if (Platform.OS === "web") return;
    logDriverNavigationOpen({
      rideId: params.rideId,
      phase,
      from: { lat: fromLat, lon: fromLon, name: params.fromName ?? "Start" },
      pickup: { lat: pickupLat, lon: pickupLon, name: pickupName },
      destination: { lat: destLat, lon: destLon, name: destName },
      routingMethod: "routing-osrm-public",
      routingUrl: "https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}",
    });
  }, [
    params.rideId,
    phase,
    fromLat,
    fromLon,
    params.fromName,
    pickupLat,
    pickupLon,
    pickupName,
    destLat,
    destLon,
    destName,
  ]);

  const mapRef  = useRef<MapView>(null);
  const mapReady = useRef(false);
  const driverArrivingSentRef = useRef(false);

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
  const [hasArrived, setHasArrived] = useState(params.arrived === "1");

  // Ton Ein/Aus
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundRef = useRef(true);

  // fare modal
  const [rideFleetStatus, setRideFleetStatus] = useState("accepted");
  const [completingRide, setCompletingRide] = useState(false);
  const [showFareModal, setShowFareModal] = useState(false);
  const [fareInput, setFareInput] = useState(
    formatDriverFareInputDe(defaultFinalFareForDriverCompletion(rideFleetStatus, estimatedFare)),
  );
  const [waitingChargeEur, setWaitingChargeEur] = useState(0);
  const [waitingMinutes, setWaitingMinutes] = useState(0);
  const [waitingEurPerHour, setWaitingEurPerHour] = useState(38);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [sliderWidth, setSliderWidth] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<RideChatMessage[]>([]);
  const [chatReplyTo, setChatReplyTo] = useState<RideChatMessage | null>(null);
  const [chatUnread, setChatUnread] = useState(false);
  const chatOpenRef = useRef(false);
  const cancelHandledRef = useRef(false);
  const [driveSheetOpen, setDriveSheetOpen] = useState(false);
  const driveSheetAnim = useRef(new Animated.Value(0)).current;
  const driveSheetOpenRef = useRef(false);

  const snapDriveSheet = useCallback(
    (open: boolean) => {
      driveSheetOpenRef.current = open;
      setDriveSheetOpen(open);
      Animated.spring(driveSheetAnim, {
        toValue: open ? 1 : 0,
        useNativeDriver: false,
        friction: 9,
        tension: 68,
      }).start();
    },
    [driveSheetAnim],
  );

  useEffect(() => {
    if (!isDrivingPhase) return;
    snapDriveSheet(false);
    setChatOpen(false);
    setChatUnread(false);
  }, [isDrivingPhase, snapDriveSheet]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    setChatMsgs([]);
    setChatInput("");
    setChatUnread(false);
    setChatReplyTo(null);
  }, [params.rideId]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sliderX = useRef(new Animated.Value(0)).current;
  const hasTriggeredSlide = useRef(false);

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

    const osrmPath = `${fLon},${fLat};${tLon},${tLat}`;
    getRouteWithSteps(
      { lat: fLat, lon: fLon, displayName: params.fromName ?? "Start" },
      { lat: tLat, lon: tLon, displayName: params.toName ?? "Ziel" }
    )
      .then((result) => {
        const coords = (result.polyline ?? []).map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
        const usedFallback =
          result.steps.length <= 2 &&
          (result.steps[0]?.instruction === "Fahrt beginnen" || result.steps[1]?.instruction === "Ziel erreicht") &&
          coords.length <= 2;
        logDriverNavigationRouteResult({
          ok: true,
          source: usedFallback ? "fallback" : "osrm",
          distanceKm: result.distanceKm,
          durationMinutes: result.durationMinutes,
          stepCount: result.steps.length,
          polylinePoints: coords.length,
        });
        if (__DEV__ && usedFallback) {
          console.warn("[DriverNav] routing_using_haversine_fallback", { osrmPath });
        }
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
      .catch((e) => {
        logDriverNavigationRouteResult({
          ok: false,
          source: "fallback",
          error: e instanceof Error ? e.message : String(e),
        });
      });
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
  const patchStatus = useCallback(
    async (
      newStatus: string,
      finalFare?: number,
      actualDistanceKm?: number,
      actualDurationMinutes?: number,
      finalFarePlausibilityAck?: boolean,
    ) => {
      if (!params.rideId) return;
      const res = await fetch(`${API_BASE}/rides/${params.rideId}/status`, {
        method: "PATCH",
        headers: await fleetAuthHeadersJson(),
        body: JSON.stringify({
          status: newStatus,
          ...(finalFare != null ? { finalFare } : {}),
          ...(actualDistanceKm != null ? { actualDistanceKm } : {}),
          ...(actualDurationMinutes != null ? { actualDurationMinutes } : {}),
          ...(finalFarePlausibilityAck ? { finalFarePlausibilityAck: true } : {}),
          driverLat: driverLat,
          driverLon: driverLon,
        }),
      });
      if (!res.ok) {
        let code = "status_update_failed";
        let errorBody: unknown = null;
        try {
          errorBody = await res.json();
          const body = errorBody as { error?: string };
          if (typeof body?.error === "string" && body.error) code = body.error;
        } catch {
          // ignore
        }
        const err = new Error(code) as Error & { userMessage?: string };
        const hint = driverRideStatusUserMessage(code, errorBody);
        if (hint) err.userMessage = hint;
        throw err;
      }
    },
    [params.rideId, driverLat, driverLon],
  );

  useEffect(() => {
    if (!params.rideId) return;
    let cancelled = false;
    const loadWaiting = async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${params.rideId}/waiting-charge-live`, {
          headers: await fleetAuthHeadersJson(),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          waitingMinutesBilled?: number;
          waitingChargeEur?: number;
          eurPerHour?: number;
        };
        if (cancelled || !res.ok || !data.ok) return;
        setWaitingMinutes(Number(data.waitingMinutesBilled ?? 0));
        setWaitingChargeEur(Number(data.waitingChargeEur ?? 0));
        setWaitingEurPerHour(Number(data.eurPerHour ?? 38));
      } catch {
        // ignore
      }
    };
    void loadWaiting();
    const id = setInterval(() => void loadWaiting(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [params.rideId, hasArrived, isPickupPhase]);

  const handleAngekommen = useCallback(async () => {
    await patchStatus("driver_waiting");
    trySpeak("Angekommen. Bitte Fahrt starten wenn der Kunde eingestiegen ist.", soundRef.current);
    setHasArrived(true);   // ← stay on screen, button changes to "Fahrt beginnen"
  }, [patchStatus]);

  const [noShowCountdownEndsAt, setNoShowCountdownEndsAt] = useState<number | null>(null);
  const [noShowBusy, setNoShowBusy] = useState(false);
  const [, setNoShowTick] = useState(0);

  const finalizeNoShow = useCallback(async () => {
    if (!params.rideId || noShowBusy) return;
    setNoShowBusy(true);
    try {
      const res = await fetch(`${API_BASE}/rides/${params.rideId}/driver-no-show/finalize`, {
        method: "POST",
        headers: await fleetAuthHeadersJson(),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !body.ok) {
        const code = typeof body.error === "string" ? body.error : "no_show_finalize_failed";
        Alert.alert("No-Show", driverRideStatusUserMessage(code, body) ?? code);
        return;
      }
      await stopDriverBackgroundLocation();
      disconnectSocket();
      trySpeak("Kunde nicht erschienen. Fahrt als No-Show abgeschlossen.", soundRef.current);
      replaceDriverStackExclusive({ pathname: "/driver/dashboard" } as Href);
    } catch {
      Alert.alert("No-Show", "Abschluss fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setNoShowBusy(false);
      setNoShowCountdownEndsAt(null);
    }
  }, [noShowBusy, params.rideId]);

  useEffect(() => {
    if (!noShowCountdownEndsAt) return;
    const id = setInterval(() => {
      setNoShowTick((t) => t + 1);
      if (Date.now() >= noShowCountdownEndsAt) {
        void finalizeNoShow();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [noShowCountdownEndsAt, finalizeNoShow]);

  const noShowRemainingSec = noShowCountdownEndsAt
    ? Math.max(0, Math.ceil((noShowCountdownEndsAt - Date.now()) / 1000))
    : 0;

  const handleNoShowStart = useCallback(async () => {
    if (!params.rideId || noShowBusy) return;
    Alert.alert(
      "Kunde nicht da?",
      "Nach dem Countdown wird eine No-Show-Gebühr berechnet und der Kunde benachrichtigt.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Countdown starten",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setNoShowBusy(true);
              try {
                const res = await fetch(`${API_BASE}/rides/${params.rideId}/driver-no-show/start`, {
                  method: "POST",
                  headers: await fleetAuthHeadersJson(),
                });
                const body = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  error?: string;
                  message?: string;
                  finalizeAfterIso?: string;
                };
                if (!res.ok || !body.ok) {
                  const code = typeof body.error === "string" ? body.error : "no_show_start_failed";
                  Alert.alert("No-Show", driverRideStatusUserMessage(code, body) ?? code);
                  return;
                }
                const endMs = body.finalizeAfterIso ? Date.parse(body.finalizeAfterIso) : Date.now() + 5 * 60_000;
                setNoShowCountdownEndsAt(endMs);
              } finally {
                setNoShowBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [noShowBusy, params.rideId]);

  const handleFahrtBeginnen = useCallback(async () => {
    try {
      await patchStatus("in_progress");
      trySpeak("Fahrt gestartet. Navigiere zum Ziel.", soundRef.current);
      setDriverNavigationPhaseParams({
        rideId: params.rideId,
        phase: "driving",
        fromLat: String(pickupLat),
        fromLon: String(pickupLon),
        fromName: pickupName,
        toLat: String(destLat),
        toLon: String(destLon),
        toName: destName,
        customerName: params.customerName ?? "",
        pickupLat: String(pickupLat),
        pickupLon: String(pickupLon),
        pickupName,
        destLat: String(destLat),
        destLon: String(destLon),
        destName,
        estimatedFare: String(estimatedFare),
        paymentMethod: params.paymentMethod ?? "",
        driverId: params.driverId ?? "",
        arrived: "0",
      });
    } catch (e) {
      const err = e as Error & { userMessage?: string };
      Alert.alert(
        "Fahrtbeginn fehlgeschlagen",
        err.userMessage ?? err.message ?? "Status konnte nicht gesetzt werden.",
      );
    }
  }, [
    patchStatus,
    params.rideId,
    params.customerName,
    params.paymentMethod,
    pickupLat,
    pickupLon,
    pickupName,
    destLat,
    destLon,
    destName,
    estimatedFare,
  ]);

  const maxSlideX = Math.max(0, sliderWidth - START_SLIDER_HANDLE - 8);
  const resetSlide = useCallback(() => {
    hasTriggeredSlide.current = false;
    Animated.spring(sliderX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  }, [sliderX]);

  const startRideBySlide = useCallback(async () => {
    if (hasTriggeredSlide.current) return;
    hasTriggeredSlide.current = true;
    try {
      await handleFahrtBeginnen();
    } finally {
      resetSlide();
    }
  }, [handleFahrtBeginnen, resetSlide]);

  const driveSheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isDrivingPhase,
        onMoveShouldSetPanResponder: (_, g) => isDrivingPhase && Math.abs(g.dy) > 8,
        onPanResponderMove: (_, g) => {
          const base = driveSheetOpenRef.current ? 1 : 0;
          const span = DRIVE_SHEET_EXPANDED_H - DRIVE_SHEET_COLLAPSED_H;
          const next = Math.min(1, Math.max(0, base - g.dy / span));
          driveSheetAnim.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          driveSheetAnim.stopAnimation((v) => {
            const open = v > 0.42 || g.vy < -0.45 ? true : g.vy > 0.45 ? false : v >= 0.5;
            snapDriveSheet(open);
          });
        },
      }),
    [isDrivingPhase, driveSheetAnim, snapDriveSheet],
  );

  /** PanResponder muss bei neuer Track-Breite neu erstellt werden — sonst bleibt maxSlideX=0 „eingefroren“. */
  const sliderResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => hasArrived && isPickupPhase && maxSlideX > 0,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 4 && hasArrived && isPickupPhase && maxSlideX > 0,
        onPanResponderMove: (_evt, gestureState) => {
          const cap = Math.max(0, maxSlideX);
          const next = Math.min(Math.max(0, gestureState.dx), cap);
          sliderX.setValue(next);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const cap = Math.max(0, maxSlideX);
          if (cap > 0 && gestureState.dx >= cap * 0.78) {
            void startRideBySlide();
            return;
          }
          resetSlide();
        },
        onPanResponderTerminate: resetSlide,
      }),
    [hasArrived, isPickupPhase, maxSlideX, resetSlide, startRideBySlide],
  );

  useEffect(() => {
    if (!params.rideId) return;
    connectToRide(
      params.rideId,
      (msg) => {
        if (msg.type === "chat:ride:update") {
          const row = parseRideChatUpdate(msg);
          if (!row) return;
          setChatMsgs((prev) => mergeRideChatMessages(prev, row));
          if (row.from === "customer" && !chatOpenRef.current) setChatUnread(true);
        }
      },
      readFleetJwtForWsJoin,
    );
    return () => disconnectSocket();
  }, [params.rideId]);

  useEffect(() => {
    if (!params.rideId) return;
    cancelHandledRef.current = false;
    const timer = setInterval(async () => {
      if (cancelHandledRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(params.rideId)}/fleet-snapshot`, {
          cache: "no-store",
          headers: await fleetAuthHeadersJson(),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { status?: string; cancelReason?: string | null };
        if (typeof payload.status === "string" && payload.status) {
          setRideFleetStatus(payload.status);
        }
        if (payload.status !== "cancelled_by_customer") return;
        cancelHandledRef.current = true;
        void stopDriverBackgroundLocation();
        Alert.alert(
          "Kunde hat storniert",
          payload.cancelReason ? `Grund: ${payload.cancelReason}` : "Die Fahrt wurde vom Kunden storniert.",
          [{ text: "OK", onPress: () => replaceDriverStackExclusive("/driver/dashboard") }],
        );
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [params.rideId]);

  /**
   * Nach App-Neustart stellt iOS/Android oft den alten Native-Stack wieder her
   * (mehrere `/driver/navigation` mit verschiedenen Params). Einmal pro Fahrt: dismissTo.
   */
  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId || stackCollapsedForRideRef.current === rideId) return;
    stackCollapsedForRideRef.current = rideId;
    router.dismissTo({
      pathname: "/driver/navigation",
      params: {
        rideId,
        phase: params.phase ?? "pickup",
        fromLat: params.fromLat ?? "0",
        fromLon: params.fromLon ?? "0",
        fromName: params.fromName ?? "",
        toLat: params.toLat ?? "0",
        toLon: params.toLon ?? "0",
        toName: params.toName ?? "",
        customerName: params.customerName ?? "",
        pickupLat: params.pickupLat ?? params.toLat ?? "0",
        pickupLon: params.pickupLon ?? params.toLon ?? "0",
        pickupName: params.pickupName ?? params.toName ?? "Abholort",
        destLat: params.destLat ?? "0",
        destLon: params.destLon ?? "0",
        destName: params.destName ?? params.toName ?? "Ziel",
        estimatedFare: params.estimatedFare ?? "0",
        paymentMethod: params.paymentMethod ?? "",
        driverId: params.driverId ?? "",
        arrived: params.arrived ?? "0",
      },
    } as Href);
  }, [params.rideId]);

  /** Betriebslogik: Navigation startet → `driver_arriving` (Kunde: Fahrer unterwegs). */
  useEffect(() => {
    if (!params.rideId || driverArrivingSentRef.current) return;
    if (rideFleetStatus !== "accepted" && rideFleetStatus !== "ready_for_dispatch") return;
    driverArrivingSentRef.current = true;
    void patchStatus("driver_arriving")
      .then(() => setRideFleetStatus("driver_arriving"))
      .catch(() => {
        driverArrivingSentRef.current = false;
      });
  }, [params.rideId, rideFleetStatus, patchStatus]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    void startDriverBackgroundLocation(rideId);
  }, [params.rideId]);

  // GPS-Recovery: wenn App aus Hintergrund kommt, prüfen ob GPS noch läuft
  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void (async () => {
          const running = await isDriverBackgroundLocationRunning();
          if (!running) {
            console.log("[driverNav] GPS not running after resume — restarting");
            await startDriverBackgroundLocation(rideId);
          }
        })();
      }
    });
    return () => sub.remove();
  }, [params.rideId]);

  const fareSettlementPreview = useMemo(() => {
    if (!driverMayBillPositiveFare(rideFleetStatus)) return null;
    const parsed = parseFloat(fareInput.replace(",", "."));
    const gross = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const cc = driver?.companyCommission;
    return computeDriverFareSettlementPreview(
      gross,
      cc?.rate ?? 0.1,
      cc?.minCommissionEur,
    );
  }, [fareInput, rideFleetStatus, driver?.companyCommission]);

  useEffect(() => {
    if (!showFareModal) return;
    void refreshEinsatzbereit();
  }, [showFareModal, refreshEinsatzbereit]);

  const handleFahrtBeenden = () => {
    trySpeak("Fahrt wird beendet.", soundRef.current);
    setFareInput(
      formatDriverFareInputDe(defaultFinalFareForDriverCompletion(rideFleetStatus, estimatedFare)),
    );
    setShowFareModal(true);
  };

  const completeRideWithFare = async (fare: number, plausibilityAck = false) => {
    setCompletingRide(true);
    try {
      const navDistanceKm = initialDistM > 0 ? Math.round(initialDistM / 100) / 10 : undefined;
      const navDurationMin = initialEtaMin > 0 ? Math.round(initialEtaMin) : undefined;
      await patchStatus("completed", fare, navDistanceKm, navDurationMin, plausibilityAck);
      await stopDriverBackgroundLocation();
      setShowFareModal(false);
      disconnectSocket();
      trySpeak("Fahrt abgeschlossen. Vielen Dank.", soundRef.current);
      replaceDriverStackExclusive({
        pathname: "/driver/dashboard",
        params: {
          followUp: "1",
          lastRideId: params.rideId ?? "",
          followUpLat: String(driverLat),
          followUpLon: String(driverLon),
        },
      } as import("expo-router").Href);
    } catch (e) {
      const code = e instanceof Error ? e.message : "status_update_failed";
      const userMessage = e instanceof Error && "userMessage" in e ? String((e as Error & { userMessage?: string }).userMessage ?? "") : "";
      Alert.alert("Abschluss fehlgeschlagen", userMessage || `Endpreis konnte nicht gespeichert werden (${code}).`);
    } finally {
      setCompletingRide(false);
    }
  };

  const handleConfirmFare = async () => {
    if (completingRide) return;
    const parsed = parseFloat(fareInput.replace(",", "."));
    const fallback = defaultFinalFareForDriverCompletion(rideFleetStatus, estimatedFare);
    const fare = isNaN(parsed) ? fallback : parsed;
    const validation = validateDriverFinalFareInput(rideFleetStatus, fare);
    if (!validation.ok) {
      Alert.alert(validation.title, validation.message);
      return;
    }
    if (driverFinalFareNeedsAcknowledgement(estimatedFare, fare)) {
      Alert.alert(
        "Preis deutlich über Schätzung",
        `Taxameter: ${fare.toFixed(2).replace(".", ",")} € — Schätzung war ${estimatedFare.toFixed(2).replace(".", ",")} €. Nur bestätigen, wenn der Taxameter-Preis stimmt.`,
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Taxameter bestätigen", style: "destructive", onPress: () => void completeRideWithFare(fare, true) },
        ],
      );
      return;
    }
    await completeRideWithFare(fare, false);
  };

  // GPS tracking
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    void (async () => {
      const fg = await requestForegroundPermissionsSafe();
      if (!fg || fg.status !== "granted") return;
      sub = await watchPositionSafe(
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
            void (async () => {
              try {
                const headers = await fleetAuthHeadersJson();
                await fetch(`${API_BASE}/rides/${params.rideId}/driver-location`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ lat: latitude, lon: longitude }),
                });
              } catch {
                /* ignore */
              }
            })();
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
    logDriverNavigationMapEvent("map_ready", {
      polylinePoints: polyline.length,
      steps: steps.length,
    });
    const fLat = fromLat || driverLat;
    const fLon = fromLon || driverLon;
    setTimeout(() => {
      mapRef.current?.animateCamera({ center: { latitude: fLat, longitude: fLon }, zoom: 14, pitch: 0 });
    }, 200);
    if (polyline.length > 1) setTimeout(() => fitRoute(polyline), 600);
  }, [fromLat, fromLon, driverLat, driverLon, polyline, fitRoute, steps.length]);

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

  const bottomInset = Math.max(insets.bottom, 16);
  const floatingControlsBottom =
    bottomInset + (isDrivingPhase ? (driveSheetOpen ? DRIVE_SHEET_EXPANDED_H + 20 : DRIVE_SHEET_COLLAPSED_H + 16) : 230);

  const driveSheetHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DRIVE_SHEET_COLLAPSED_H, DRIVE_SHEET_EXPANDED_H],
  });
  const driveDetailsHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 118],
  });
  const driveCancelHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });

  const rideDetailsBlock = (
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
          <Text style={styles.etaCustomer} numberOfLines={1}>
            {params.customerName}
          </Text>
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
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#0F172A" }} numberOfLines={1}>
            {(params.paymentMethod ?? "").startsWith("Krankenkasse") ? "Krankenkasse" : params.paymentMethod || "Bar"}
          </Text>
        </View>
      </View>
    </View>
  );

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
      // Step 2: "Fahrt beginnen" via slide-right control
      actionBtn = (
        <View style={{ gap: 10 }}>
          <View
            style={styles.slideStartTrack}
            onLayout={(ev) => setSliderWidth(ev.nativeEvent.layout.width)}
            {...sliderResponder.panHandlers}
          >
            <Text style={styles.slideStartHint}>Nach rechts ziehen, um Fahrt zu beginnen</Text>
            <Animated.View
              style={[styles.slideStartHandle, { transform: [{ translateX: sliderX }] }]}
            >
              <MaterialCommunityIcons name="car-arrow-right" size={24} color="#fff" />
            </Animated.View>
          </View>
          {waitingMinutes > 0 ? (
            <Text style={styles.waitingLiveBanner}>
              {formatWaitingChargeDe(waitingMinutes, waitingChargeEur, waitingEurPerHour)}
            </Text>
          ) : null}
          {noShowCountdownEndsAt ? (
            <Text style={styles.noShowCountdownText}>
              No-Show in {Math.floor(noShowRemainingSec / 60)}:
              {String(noShowRemainingSec % 60).padStart(2, "0")} Min.
            </Text>
          ) : (
            <Pressable
              onPress={() => void handleNoShowStart()}
              disabled={noShowBusy}
              style={({ pressed }) => [styles.noShowLinkBtn, pressed && { opacity: 0.85 }, noShowBusy && { opacity: 0.5 }]}
            >
              <Text style={styles.noShowLinkText}>Kunde nicht da</Text>
            </Pressable>
          )}
        </View>
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
        <View style={styles.topBrandBadge}>
          <Text style={styles.topBrandBadgeText}>OR</Text>
        </View>
        <View style={styles.topCard}>
          <View style={styles.topMain}>
            <Animated.View style={{ opacity: pulseAnim }}>
              <MaterialCommunityIcons name={maneuverIcon(currentStep?.instruction ?? "") as any} size={26} color="#fff" />
            </Animated.View>
            <View style={styles.topText}>
              <Text style={styles.topLabel}>Richtung</Text>
              <Text style={[styles.topStreet, !isPickupPhase && styles.topStreetDriving]} numberOfLines={2}>
                {topPrimaryText}
              </Text>
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

      {/* Floating button column — right side above bottom panel */}
      <View style={{ position: "absolute", right: 12, bottom: floatingControlsBottom, gap: 10 }}>
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
        {isPickupPhase ? (
          <Pressable
            style={styles.navChatBtn}
            accessibilityLabel="Chat"
            onPress={() => {
              setChatUnread(false);
              setChatOpen(true);
            }}
          >
            <Text style={styles.navChatBtnLabel}>Chat</Text>
            {chatUnread ? <View style={styles.navChatBadge} /> : null}
          </Pressable>
        ) : null}
      </View>

      {isDrivingPhase ? (
        <Animated.View
          style={[
            styles.driveBottomSheet,
            { paddingBottom: bottomInset, height: Animated.add(driveSheetHeight, bottomInset) },
          ]}
        >
          <View style={styles.sheetGrabRow} {...driveSheetPan.panHandlers}>
            <Pressable
              style={styles.sheetGrabHit}
              onPress={() => snapDriveSheet(!driveSheetOpen)}
              accessibilityLabel={driveSheetOpen ? "Fahrtdetails einklappen" : "Fahrtdetails ausklappen"}
            >
              <View style={styles.sheetGrabPill} />
            </Pressable>
            <Pressable style={styles.sheetPeekPress} onPress={() => snapDriveSheet(!driveSheetOpen)}>
              <Text style={styles.sheetPeekText} numberOfLines={1}>
                {remainingMin > 0 ? `${remainingMin} min` : "—"}
                {remainingDistM > 0 ? ` · ${fmtDist(remainingDistM)}` : ""}
                {params.customerName ? ` · ${params.customerName}` : ""}
              </Text>
            </Pressable>
            <Pressable onPress={() => snapDriveSheet(!driveSheetOpen)} hitSlop={10}>
              <Feather name={driveSheetOpen ? "chevron-down" : "chevron-up"} size={22} color="#64748B" />
            </Pressable>
          </View>

          <Animated.View style={{ maxHeight: driveDetailsHeight, opacity: driveSheetAnim, overflow: "hidden" }}>
            <View style={styles.driveDetailsWrap}>{rideDetailsBlock}</View>
          </Animated.View>

          <View style={styles.driveEndActionWrap}>
            <View style={styles.actionBtnWrapper}>{actionBtn}</View>
          </View>

          <Animated.View style={{ maxHeight: driveCancelHeight, opacity: driveSheetAnim, overflow: "hidden" }}>
            <View style={styles.driveCancelDivider} />
            <Pressable
              onPress={() => setShowCancelReasonModal(true)}
              style={({ pressed }) => [styles.driveCancelBtn, pressed && { backgroundColor: "#FEF2F2" }]}
            >
              <Feather name="x-circle" size={18} color="#DC2626" />
              <Text style={styles.driveCancelBtnText}>Fahrt stornieren</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : (
        <View style={[styles.bottomBar, { paddingBottom: bottomInset }]}>
          {rideDetailsBlock}
          <View style={styles.actionBlock}>
            <View style={styles.actionBtnWrapper}>{actionBtn}</View>
            <Pressable
              onPress={() => setShowCancelReasonModal(true)}
              style={({ pressed }) => [
                styles.actionBlockCancel,
                pressed && { backgroundColor: "#FEF2F2" },
              ]}
            >
              <Feather name="x-circle" size={18} color="#DC2626" />
              <Text style={styles.actionBlockCancelText}>Fahrt stornieren</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Fare Modal */}
      <Modal visible={showFareModal} transparent animationType="slide" onRequestClose={() => setShowFareModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Feather name="flag" size={26} color="#22C55E" />
              <Text style={styles.modalTitle}>Fahrt beenden</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              {driverMayBillPositiveFare(rideFleetStatus)
                ? (
                  <>
                    Fahrtpreis für{" "}
                    <Text style={{ fontFamily: "Inter_700Bold" }}>{params.customerName ?? "Kunden"}</Text> bestätigen:
                  </>
                )
                : "Keine Fahrt zum Ziel — bitte 0,00 € bestätigen (Kunde wird nicht belastet)."}
            </Text>
            <DriverFareEntryLegalHints
              vehicle={params.vehicle}
              mayBillPositive={driverMayBillPositiveFare(rideFleetStatus)}
              snapshotVehicleClassMultiplier={
                params.vehicleClassMultiplier?.trim()
                  ? Number.parseFloat(params.vehicleClassMultiplier)
                  : null
              }
              snapshotXlFixedSurchargeEur={
                params.xlFixedSurchargeEur?.trim()
                  ? Number.parseFloat(params.xlFixedSurchargeEur)
                  : null
              }
            />
            {driverMayBillPositiveFare(rideFleetStatus) ? (
              <View style={styles.fareBox}>
                <Text style={styles.fareBoxLabel}>Taxameter-Endpreis (€)</Text>
                <TextInput
                  style={styles.fareInput}
                  value={fareInput}
                  onChangeText={setFareInput}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
                {waitingChargeEur > 0.009 ? (
                  <Text style={styles.waitingFareHint}>
                    + Wartezeit {waitingChargeEur.toFixed(2).replace(".", ",")} € ({waitingMinutes} Min) wird beim
                    Abschluss addiert.
                  </Text>
                ) : null}
              </View>
            ) : null}
            {driverMayBillPositiveFare(rideFleetStatus) &&
            fareSettlementPreview &&
            fareSettlementPreview.grossEur > 0 ? (
              <View style={styles.settlementBox}>
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>Fahrtpreis</Text>
                  <Text style={styles.settlementValue}>{formatEuro(fareSettlementPreview.grossEur)}</Text>
                </View>
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>
                    ONRODA Provision ({fareSettlementPreview.commissionRatePercent} %)
                  </Text>
                  <Text style={[styles.settlementValue, styles.settlementMinus]}>
                    −{formatEuro(fareSettlementPreview.commissionEur)}
                  </Text>
                </View>
                <View style={styles.settlementDivider} />
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementPayoutLabel}>Ihr Anteil</Text>
                  <Text style={styles.settlementPayoutValue}>
                    {formatEuro(fareSettlementPreview.payoutEur)}
                  </Text>
                </View>
                <Text style={styles.settlementHint}>
                  nach {fareSettlementPreview.commissionRatePercent} % ONRODA-Provision
                </Text>
              </View>
            ) : null}
            {!driverMayBillPositiveFare(rideFleetStatus) ? (
              <View style={[styles.fareBox, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }]}>
                <Text style={[styles.fareBoxLabel, { color: "#15803D" }]}>Endpreis</Text>
                <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: "#15803D" }}>0,00 €</Text>
              </View>
            ) : null}
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowFareModal(false)}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, completingRide && { opacity: 0.65 }]}
                onPress={handleConfirmFare}
                disabled={completingRide}
              >
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>{completingRide ? "Wird gesendet…" : "Abschicken"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCancelReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelReasonModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.cancelReasonCard}>
            <Text style={styles.cancelReasonTitle}>Storno-Grund</Text>
            <Text style={styles.cancelReasonLead}>Bitte Grund angeben, damit die Fahrt umgeleitet werden kann.</Text>
            <View style={styles.cancelReasonOptions}>
              {[
                "Kunde nicht gefunden",
                "Fahrzeugproblem",
                "Notfall / Unfall",
                "Kunde nicht erreichbar",
                "Andere Ursache",
              ].map((reason) => {
                const active = cancelReason === reason;
                return (
                  <Pressable
                    key={reason}
                    style={[styles.cancelReasonChip, active && styles.cancelReasonChipOn]}
                    onPress={() => setCancelReason(reason)}
                  >
                    <Text style={[styles.cancelReasonChipText, active && styles.cancelReasonChipTextOn]}>{reason}</Text>
                  </Pressable>
                );
              })}
            </View>
            {cancelReason === "Andere Ursache" ? (
              <TextInput
                style={styles.cancelReasonInput}
                placeholder="Grund kurz beschreiben"
                placeholderTextColor="#9CA3AF"
                value={customCancelReason}
                onChangeText={setCustomCancelReason}
              />
            ) : null}
            <View style={styles.cancelReasonBtns}>
              <Pressable
                style={styles.cancelReasonBtnGhost}
                onPress={() => {
                  setShowCancelReasonModal(false);
                  setCancelReason("");
                  setCustomCancelReason("");
                }}
              >
                <Text style={styles.cancelReasonBtnGhostText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={styles.cancelReasonBtnDanger}
                onPress={async () => {
                  const reason =
                    cancelReason === "Andere Ursache" ? customCancelReason.trim() : cancelReason.trim();
                  if (!reason) {
                    Alert.alert("Storno-Grund fehlt", "Bitte einen Grund auswählen.");
                    return;
                  }
                  try {
                    const rideId = params.rideId?.trim() ?? "";
                    const driverId = (params.driverId ?? "").trim();
                    if (!rideId || !driverId) throw new Error("driver_cancel_failed");
                    await driverCancelRequest(rideId, driverId);
                  } catch (e) {
                    const code = e instanceof Error ? e.message : "driver_cancel_failed";
                    if (code === "reservation_storno_locked") {
                      Alert.alert(
                        "Storno nicht möglich",
                        "Bei Vorbestellungen ist ein Storno nur bis 60 Minuten vor der geplanten Abholzeit möglich. Bitte wenden Sie sich bei Bedarf an die Zentrale.",
                      );
                      return;
                    }
                    Alert.alert("Storno fehlgeschlagen", code ? `Technisch: ${code}` : "Bitte erneut versuchen.");
                    return;
                  }
                  setShowCancelReasonModal(false);
                  setCancelReason("");
                  setCustomCancelReason("");
                  disconnectSocket();
                  replaceDriverStackExclusive("/driver/dashboard");
                }}
              >
                <Text style={styles.cancelReasonBtnDangerText}>Fahrt stornieren</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={chatOpen} transparent animationType="fade" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlayCenter}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChatOpen(false)} />
          <Pressable style={styles.cancelReasonCard} onPress={() => {}}>
            <View style={styles.driverChatHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelReasonTitle}>Chat</Text>
                <Text style={styles.driverChatSubtitle}>Kunde</Text>
              </View>
              <Pressable
                onPress={() => setChatOpen(false)}
                hitSlop={12}
                style={styles.driverChatCloseBtn}
                accessibilityLabel="Chat schließen"
              >
                <Feather name="x" size={22} color="#374151" />
              </Pressable>
            </View>
            {chatReplyTo ? (
              <View style={styles.driverChatReplyBanner}>
                <Text style={styles.driverChatReplyBannerLabel} numberOfLines={1}>
                  Antwort auf {chatReplyTo.from === "customer" ? "Kunde" : "Sie"}: {chatReplyTo.text}
                </Text>
                <Pressable onPress={() => setChatReplyTo(null)} hitSlop={8}>
                  <Feather name="x" size={16} color="#6B7280" />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.driverChatThreadBox}>
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {chatMsgs.length === 0 ? (
                  <Text style={styles.driverChatEmptyHint}>
                    Noch keine Nachricht. Vorlage unten antippen oder selbst tippen.
                  </Text>
                ) : (
                  chatMsgs.map((m) => (
                    <Pressable
                      key={m.id}
                      style={m.from === "customer" ? styles.driverChatBubbleIncoming : styles.driverChatBubbleOutgoing}
                      onLongPress={() => {
                        setChatReplyTo(m);
                        Haptics.selectionAsync();
                      }}
                    >
                      {m.replyTo ? (
                        <Text style={styles.driverChatReplyQuote} numberOfLines={2}>
                          {m.replyTo.from === "customer" ? "Kunde" : "Sie"}: {m.replyTo.text}
                        </Text>
                      ) : null}
                      <Text style={styles.driverChatBubbleMeta}>
                        {m.from === "customer" ? "Kunde" : "Sie"}
                        {m.pending ? " · senden…" : ""}
                      </Text>
                      <Text style={styles.driverChatBubbleText}>{m.text}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <Text style={styles.driverChatTemplatesLabel}>Vorlagen</Text>
              <View style={styles.driverChatTemplatesWrap}>
                {["Ich bin gleich da", "Bin vor Ort", "Bitte kurz warten"].map((q) => (
                  <Pressable
                    key={q}
                    style={styles.driverChatTemplateChip}
                    onPress={() => setChatInput(q)}
                  >
                    <Text style={styles.driverChatTemplateChipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.driverChatInputInThread}
                placeholder="Nachricht tippen …"
                placeholderTextColor="#9CA3AF"
                value={chatInput}
                onChangeText={setChatInput}
                multiline
              />
            </View>
            <View style={styles.cancelReasonBtns}>
              <Pressable style={styles.cancelReasonBtnGhost} onPress={() => setChatOpen(false)}>
                <Text style={styles.cancelReasonBtnGhostText}>Schließen</Text>
              </Pressable>
              <Pressable
                style={styles.cancelReasonBtnDanger}
                onPress={() => {
                  const msg = chatInput.trim();
                  if (!msg) return;
                  const reply = chatReplyTo
                    ? { from: chatReplyTo.from as RideChatSender, text: chatReplyTo.text }
                    : undefined;
                  const pendingId = rideChatMessageId(`pending-${Date.now()}`, "driver", msg);
                  setChatMsgs((prev) =>
                    mergeRideChatMessages(prev, {
                      id: pendingId,
                      from: "driver",
                      text: msg,
                      pending: true,
                      ...(reply ? { replyTo: reply } : {}),
                    }),
                  );
                  sendRideChat({ text: msg, sender: "driver", replyTo: reply });
                  setChatInput("");
                  setChatReplyTo(null);
                }}
              >
                <Text style={styles.cancelReasonBtnDangerText}>Senden</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#242f3e" },

  /* Top card */
  topWrapper: { position: "absolute", top: 0, left: 0, right: 0 },
  topCard: { backgroundColor: "#1B6B3A", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 11 },
  topBrandBadge: {
    position: "absolute",
    top: 6,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 2,
    borderColor: "#fff",
  },
  topBrandBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  topMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1 },
  topLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.78)" },
  topStreet: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 25 },
  topStreetDriving: { fontSize: 24, lineHeight: 29 },
  topDist: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.84)", marginTop: 2 },
  compassBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  navChatBtn: {
    minWidth: 56,
    paddingHorizontal: 10,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  navChatBtnLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#1B6B3A", letterSpacing: 0.2 },
  navChatBadge: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#fff",
  },
  dannCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  dannText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", flex: 1 },

  /* Bottom bar — helles Panel (Angekommen / Fahrt beenden / Storno) */
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#FFFFFF",
    flexDirection: "column",
    paddingTop: 14, paddingHorizontal: 16, gap: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  actionBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 10,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  actionBlockCancel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#FECACA",
  },
  actionBlockCancelText: { color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 15 },
  driveBottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 18,
    overflow: "hidden",
  },
  sheetGrabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
  },
  sheetGrabHit: { paddingVertical: 4, paddingHorizontal: 4 },
  sheetGrabPill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
  },
  sheetPeekPress: { flex: 1, minWidth: 0 },
  sheetPeekText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#475569" },
  driveDetailsWrap: { paddingTop: 4, paddingBottom: 8 },
  driveEndActionWrap: { marginTop: 2, marginBottom: 4 },
  driveCancelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginTop: 10,
    marginBottom: 10,
  },
  driveCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  driveCancelBtnText: { color: "#DC2626", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  etaRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  etaBlock: { minWidth: 90 },
  etaMin: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#15803D", lineHeight: 34 },
  etaDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#64748B", marginTop: 2 },
  etaCustomerBlock: { flex: 1, justifyContent: "center" },
  etaCustomer: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#0F172A" },
  etaDest: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#64748B", marginTop: 3 },
  etaPickupDist: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#15803D", marginTop: 4 },
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
  slideStartTrack: {
    position: "relative",
    backgroundColor: "#16A34A",
    borderRadius: 16,
    height: 62,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#86EFAC",
  },
  slideStartHint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 48,
  },
  slideStartHandle: {
    position: "absolute",
    left: 4,
    top: 4,
    width: START_SLIDER_HANDLE,
    height: START_SLIDER_HANDLE,
    borderRadius: START_SLIDER_HANDLE / 2,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#DCFCE7",
  },
  noShowLinkBtn: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  noShowLinkText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textDecorationLine: "underline",
  },
  noShowCountdownText: {
    color: "#FEF3C7",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  waitingLiveBanner: {
    color: "#BFDBFE",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  waitingFareHint: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    lineHeight: 17,
  },

  /* Fare Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalOverlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 18 },
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
  settlementBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  settlementRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settlementLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#64748B", flex: 1 },
  settlementValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#334155" },
  settlementMinus: { color: "#DC2626" },
  settlementDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 2 },
  settlementPayoutLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827" },
  settlementPayoutValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#15803D" },
  settlementHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "right",
    marginTop: -4,
  },
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
  cancelReasonCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 12,
  },
  cancelReasonTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827" },
  cancelReasonLead: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#4B5563", lineHeight: 19 },
  cancelReasonOptions: { gap: 8 },
  cancelReasonChip: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
  },
  cancelReasonChipOn: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  cancelReasonChipText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#111827" },
  cancelReasonChipTextOn: { color: "#B91C1C", fontFamily: "Inter_700Bold" },
  cancelReasonInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#111827",
    fontFamily: "Inter_400Regular",
  },
  driverChatSubtitle: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#6B7280", marginTop: -6 },
  driverChatThreadBox: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    padding: 12,
    gap: 10,
    minHeight: 168,
  },
  driverChatEmptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 19,
  },
  driverChatHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  driverChatCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  driverChatBubbleIncoming: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    gap: 4,
    marginBottom: 8,
  },
  driverChatBubbleOutgoing: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    backgroundColor: "#DCFCE7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#86EFAC",
    padding: 10,
    gap: 4,
    marginBottom: 8,
  },
  driverChatBubbleMeta: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  driverChatReplyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderLeftWidth: 3,
    borderLeftColor: "#DC2626",
  },
  driverChatReplyBannerLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#4B5563" },
  driverChatReplyQuote: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginBottom: 4,
    paddingLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: "#D1D5DB",
  },
  driverChatBubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#111827", lineHeight: 20 },
  driverChatTemplatesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#9CA3AF", letterSpacing: 0.4 },
  driverChatTemplatesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  driverChatTemplateChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  driverChatTemplateChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  driverChatInputInThread: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 44,
    textAlignVertical: "top",
  },
  cancelReasonBtns: { flexDirection: "row", gap: 10, marginTop: 2 },
  cancelReasonBtnGhost: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  cancelReasonBtnGhostText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#374151" },
  cancelReasonBtnDanger: {
    flex: 1.4,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelReasonBtnDangerText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Web fallback */
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16, backgroundColor: "#fff" },
  webTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#1F2937" },
  webBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center" },
  webBtn: { backgroundColor: "#DC2626", borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  webBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
