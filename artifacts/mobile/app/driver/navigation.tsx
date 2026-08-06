import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  type TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import MapView, { Marker } from "react-native-maps";
import { nativeMapViewProps, usesGoogleMapTiles } from "@/utils/nativeMapProvider";
import { logMapsRuntimeDiagnosticsOnce } from "@/utils/mapsDiagnostics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DriverFareEntryLegalHints } from "@/components/DriverFareEntryLegalHints";
import { DriverCashPaymentWarnModal } from "@/components/DriverCashPaymentWarnModal";
import { NavRouteGlowPolyline } from "@/components/NavRouteGlowPolyline";
import { DriverRideEarningsModal } from "@/components/DriverRideEarningsModal";
import { DriverTipThanksOverlay } from "@/components/DriverTipThanksOverlay";
import { DriverPassengerRatingModal } from "@/components/DriverPassengerRatingModal";
import { useDriver } from "@/context/DriverContext";
import { useRideRequests, type RequestStatus } from "@/context/RideRequestContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  getCurrentPositionSafe,
  requestForegroundPermissionsSafe,
  watchPositionSafe,
} from "@/utils/safeExpoLocation";
import {
  replaceDriverStackExclusive,
  setDriverNavigationPhaseParams,
} from "@/utils/driverNavigationRoute";
import { driverScheduledPassengerLines } from "@/utils/passengerDisplayLabel";
import { driverRideStatusUserMessage } from "@/utils/driverRideStatusErrors";
import { RideChatModal } from "@/components/ride-chat/RideChatModal";
import { RideChatReplyBanner } from "@/components/ride-chat/RideChatReplyBanner";
import { DriverChatBlinkIcon } from "@/components/driver/DriverChatBlinkIcon";
import { DriverPassengerPinModal } from "@/components/driver/DriverPassengerPinModal";
import { fetchRidePassengerPinStatus } from "@/utils/driverVerifyPassengerPinApi";
import { rideRequiresPassengerPinClient } from "@/utils/rideRequiresPassengerPin";
import { useFleetRideChatUnread } from "@/hooks/useFleetRideChatUnread";
import {
  apiMessageToRideChatMessage,
  isRideChatSendAllowed,
  mergeRideChatMessages,
  mergeRideChatMessagesFromApi,
  parseRideChatUpdate,
  rideChatMessageId,
  rideChatMessagesFromApi,
  type RideChatMessage,
  type RideChatReplyTarget,
  type RideChatSender,
} from "@/utils/rideChat";
import {
  fetchFleetRideChatMessages,
  sendFleetRideChatMessage,
} from "@/utils/rideChatApi";
import {
  connectToRide,
  disconnectSocket,
  sendDriverLocation as socketSendDriver,
  sendDriverNavRoute,
} from "@/utils/socket";
import {
  downsampleRoutePolyline,
  polylinePairsFromLatLon,
} from "@/utils/driverRouteShare";
import {
  syncDriverPresenceState,
} from "@/utils/driverBackgroundLocation";
import { acceptDriverGpsFix } from "@/utils/gpsOutlierFilter";
import { readFleetJwtForWsJoin } from "@/utils/wsJoinAuth";
import {
  logDriverNavigationMapEvent,
  logDriverNavigationOpen,
  logDriverNavigationRouteResult,
} from "@/utils/driverNavigationDiagnostics";
import type { RouteStep } from "@/utils/routing";
import { fetchDriverNavRoute, type DriverNavRouteResult } from "@/utils/driverNavRouteApi";
import {
  bearingAlongPolylineLookaheadDeg,
  distanceAlongPolylineToPointM,
  distanceToPolylineM,
  remainingAlongPolyline,
  scaleRemainingToAuthoritative,
} from "@/utils/routeRemainingAlongPolyline";
import {
  formatNavTurnCue,
  formatNavTurnDistanceLabel,
  splitNavStepParts,
} from "@/utils/navTurnDistanceCue";
import {
  canStartReroute,
  createOffRouteTrackerState,
  noteOffRouteSample,
  type OffRouteTrackerState,
} from "@/utils/navOffRouteReroute";
import {
  defaultDriverFareInputForCompletion,
  defaultFinalFareForDriverCompletion,
  driverAgreedFixedPriceEur,
  driverMayBillPositiveFare,
  driverSkipsManualFareEntry,
  formatDriverFareInputDe,
  driverFinalFareNeedsAcknowledgement,
  validateDriverFinalFareInput,
} from "@/utils/driverRideCompletion";
import { planAbortAwaitingFareEnter } from "@/utils/driverAbortAwaitingFareEnter";
import { CUSTOMER_FIXED_PRICE_LABEL } from "@/utils/customerFareDisplay";
import { computeDriverFareSettlementPreview } from "@/utils/driverFareSettlementPreview";
import { isCustomerAbortPendingFareStatus, isCustomerFinalCancelledStatus } from "@/utils/customerRideListFilters";
import {
  setDriverLiveNavigationRideId,
  subscribeDriverDestinationChanged,
  subscribeDriverRideAbortedAwaitingFare,
  subscribeDriverRideCancelledByCustomer,
} from "@/utils/driverLiveNavigation";
import {
  NAV_CAMERA_FOLLOW_DURATION_MS,
  NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS,
  NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS,
  NAV_CAMERA_MIN_HEADING_DELTA_DEG,
  NAV_CAMERA_MIN_MOVE_M,
  NAV_CAMERA_STILL_MIN_MOVE_M,
  createNavHeadingSmootherState,
  createNavPositionSmootherState,
  isMovingForNavHeading,
  isUsableCourse,
  resolveNavSpeedMps,
  tickNavHeading,
  tickNavPosition,
  type NavHeadingSmootherState,
  type NavPositionSmootherState,
} from "@/utils/navHeadingSmoother";
import { shortestRotationDelta } from "@/utils/liveDriverMarkerMotion";
import { formatEuro } from "@/utils/fareCalculator";
import {
  driverRidePaymentLooksLikeCash,
  postDriverCashConfirmed,
} from "@/utils/driverCashPaymentApi";
import {
  fetchFleetDriverRideEarnings,
  type DriverRideEarnings,
} from "@/utils/fleetDriverRideEarnings";

const API_BASE = getApiBaseUrl();
const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const START_SLIDER_HANDLE = 52;
const PICKUP_AUX_ICON_RED = "#FF3B30";
const PICKUP_AUX_BORDER_LIGHT_RED = "#FECACA";
const PICKUP_AUX_PRESSED_BG = "#FFF1F2";
const DRIVE_SHEET_GRAB_H = 28;
/** Max-Höhe der ausklappbaren Detail-Sektion (Adressen/Zahlung) — Sheet selbst hugt Inhalt. */
const DRIVE_SHEET_DETAILS_H = 200;
/** Ansage am Abholort — wiederholt sich bei Inaktivität. */
const ARRIVED_PICKUP_SPEAK =
  "Ziel erreicht. Bitte den Code vom Fahrgast nehmen und losfahren.";
const ARRIVED_PICKUP_SPEAK_REPEAT_MS = 60_000;

type NavPaymentUi = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  iconColor: string;
  chipBg: string;
};

function resolveNavPaymentUi(paymentMethod: string): NavPaymentUi {
  const pm = (paymentMethod ?? "").trim();
  const lower = pm.toLowerCase().replace(/_/g, " ");

  if (lower.startsWith("krankenkasse") || lower.includes("kv") || lower.includes("voucher") || lower.includes("transportschein")) {
    return { icon: "ticket-percent-outline", label: "KK", iconColor: "#007AFF", chipBg: "#F3F4F6" };
  }
  if (
    lower === "app" ||
    lower.includes("app zahl") ||
    lower.includes("app-zahl") ||
    lower.includes("apple") ||
    lower.includes("google pay") ||
    lower.includes("googlepay")
  ) {
    return { icon: "cellphone", label: "APP", iconColor: "#2563EB", chipBg: "#F3F4F6" };
  }
  if (lower === "paypal") {
    return { icon: "wallet-outline", label: "PayPal", iconColor: "#0070BA", chipBg: "#F3F4F6" };
  }
  if (
    lower.includes("karte") ||
    lower.includes("card") ||
    lower.includes("kredit") ||
    lower.includes("credit")
  ) {
    return { icon: "credit-card-outline", label: "KARTE", iconColor: "#FF3B30", chipBg: "#F3F4F6" };
  }
  if (lower.includes("rechnung") || lower === "invoice") {
    return { icon: "file-document-outline", label: "RECHNUNG", iconColor: "#6B7280", chipBg: "#F3F4F6" };
  }
  // Bar / Default — gleiches Chip-Layout, grüne Farbe
  return { icon: "currency-eur", label: "BAR", iconColor: "#16A34A", chipBg: "#F3F4F6" };
}

function navAppleFont(weight: "regular" | "medium" | "semibold" | "bold"): Pick<TextStyle, "fontFamily" | "fontWeight"> {
  if (Platform.OS === "ios") {
    const map = { regular: "400", medium: "500", semibold: "600", bold: "700" } as const;
    return { fontWeight: map[weight] };
  }
  const inter = {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  };
  return { fontFamily: inter[weight] };
}

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

const NAV_CAMERA_ZOOM = 18;
/** Etwas flacher = weniger „Kippen“-Gefühl bei Heading-Wechsel. */
const NAV_CAMERA_PITCH = 50;
/** Unteres Padding → Puck sitzt im unteren Drittel, Kamera bleibt auf Fahrerposition. */
const NAV_MAP_PADDING = { top: 140, right: 56, bottom: 200, left: 24 };

function isValidMapCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Fallback-Bearing (Step/Ziel) — ohne Device-Kurs; Glättung läuft über navHeadingSmoother. */
function resolveNavFallbackBearing(
  lat: number,
  lon: number,
  opts: {
    steps?: RouteStep[];
    stepIdx?: number;
    target?: { lat: number; lon: number };
  },
): number {
  const step = opts.steps?.[opts.stepIdx ?? 0];
  if (step && isValidMapCoord(step.lat, step.lon)) {
    return bearingDeg(lat, lon, step.lat, step.lon);
  }
  if (opts.target && isValidMapCoord(opts.target.lat, opts.target.lon)) {
    return bearingDeg(lat, lon, opts.target.lat, opts.target.lon);
  }
  return 0;
}

/** Apple Maps nutzt altitude (m), Google Maps zoom — zoom allein auf iOS wirkt nicht. */
function zoomLevelToAltitudeMeters(zoom: number, latitude: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

function buildNavCamera(
  lat: number,
  lon: number,
  heading: number,
  opts?: { zoom?: number; altitude?: number | null; pitch?: number },
) {
  const center = { latitude: lat, longitude: lon };
  const zoom = opts?.zoom ?? NAV_CAMERA_ZOOM;
  const pitch = opts?.pitch ?? NAV_CAMERA_PITCH;
  const base = { center, heading, pitch };
  if (usesGoogleMapTiles()) {
    return { ...base, zoom };
  }
  const altitude =
    opts?.altitude != null && Number.isFinite(opts.altitude)
      ? opts.altitude
      : zoomLevelToAltitudeMeters(zoom, lat);
  return { ...base, altitude };
}

function fmtArrival(remainingMin: number): string {
  const d = new Date(Date.now() + remainingMin * 60000);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Kurz Navi-Abbiege-Ansagen unterdrücken, damit Ankunfts-Ansage durchkommt. */
let suppressNavSpeechUntilMs = 0;

function trySpeak(
  text: string,
  enabled: boolean,
  opts?: { priority?: boolean; onDone?: () => void },
) {
  if (!enabled || Platform.OS === "web") return;
  if (!opts?.priority && Date.now() < suppressNavSpeechUntilMs) return;
  try {
    Speech.stop();
    if (opts?.priority) {
      suppressNavSpeechUntilMs = Date.now() + 10_000;
    }
    Speech.speak(text, {
      language: "de-DE",
      rate: 0.92,
      onDone: () => {
        opts?.onDone?.();
      },
      onStopped: () => {
        opts?.onDone?.();
      },
      onError: () => {
        opts?.onDone?.();
      },
    });
  } catch (_) {
    opts?.onDone?.();
  }
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
  // Wie Google Maps: Bildschirm bleibt wach, solange die Navi-Route gemountet ist.
  useKeepAwake();

  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    rideId: string; phase: string;
    fromLat: string; fromLon: string; fromName: string;
    toLat: string; toLon: string; toName: string;
    customerName: string;
    bookingPartnerName?: string;
    pickupLat: string; pickupLon: string; pickupName: string;
    destLat: string; destLon: string; destName: string;
    estimatedFare: string;
    paymentMethod: string;
    vehicle?: string;
    vehicleClassMultiplier?: string;
    xlFixedSurchargeEur?: string;
    /** "funk" = Telefon-Weiterleitung ohne Abrechnung/PIN. */
    dispatchMode?: string;
    driverId: string;
    arrived?: string;
    /** "1" = private Merkliste, kein Auftrags-API. */
    privateMemo?: string | string[];
  }>();

  const privateMemoRaw = Array.isArray(params.privateMemo)
    ? params.privateMemo[0]
    : params.privateMemo;
  const rideIdRaw = (Array.isArray(params.rideId) ? params.rideId[0] : params.rideId)?.trim() ?? "";
  /** Private Merkliste — auch Fallback über ppr- ID, falls Param verloren geht. */
  const isPrivateMemo =
    privateMemoRaw === "1" ||
    privateMemoRaw === "true" ||
    rideIdRaw.startsWith("ppr-");
  const isPrivateMemoRef = useRef(isPrivateMemo);
  isPrivateMemoRef.current = isPrivateMemo;

  const exitPrivateMemoNav = useCallback(() => {
    // Immer replace — kein dismissTo, kein Storno/Status.
    router.replace("/driver/dashboard" as Href);
  }, []);

  const { driverCancelRequest, requests, driverMarketRequests, scheduledPoolRequests, driverMarketScheduledPool } = useRideRequests();
  const { driver, refreshEinsatzbereit } = useDriver();
  const driverMarketOnline = Boolean(driver?.einsatzbereit && driver?.isAvailable);
  const syncNavPresence = useCallback(
    async (activeRideId?: string | null) => {
      await syncDriverPresenceState({
        isMarketOnline: driverMarketOnline,
        activeRideId: isPrivateMemo
          ? null
          : (activeRideId ?? params.rideId?.trim() ?? null),
      });
    },
    [driverMarketOnline, params.rideId, isPrivateMemo],
  );
  const activeRide = useMemo(() => {
    const id = (params.rideId ?? "").trim();
    if (!id) return null;
    return (
      requests.find((r) => r.id === id) ??
      driverMarketRequests.find((r) => r.id === id) ??
      scheduledPoolRequests.find((r) => r.id === id) ??
      driverMarketScheduledPool.find((r) => r.id === id) ??
      null
    );
  }, [requests, driverMarketRequests, scheduledPoolRequests, driverMarketScheduledPool, params.rideId]);
  const stackCollapsedForRideRef = useRef<string | null>(null);

  const phase = params.phase ?? "pickup";
  const isPickupPhase = isPrivateMemo || phase === "pickup";
  const isDrivingPhase = !isPrivateMemo && !isPickupPhase;

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
  const isFunkDispatch =
    params.dispatchMode === "funk" || activeRide?.dispatchMode === "funk";
  const isFixedPriceRide = !isFunkDispatch && driverSkipsManualFareEntry(activeRide?.pricingMode);
  const agreedFixedPriceEur = useMemo(
    () =>
      driverAgreedFixedPriceEur({
        pricingMode: activeRide?.pricingMode,
        estimatedFare: activeRide?.estimatedFare ?? estimatedFare,
      }),
    [activeRide?.pricingMode, activeRide?.estimatedFare, estimatedFare],
  );

  const navigationTarget = useMemo(() => {
    if (isPickupPhase) {
      if (isValidMapCoord(pickupLat, pickupLon)) return { lat: pickupLat, lon: pickupLon };
      if (isValidMapCoord(toLat, toLon)) return { lat: toLat, lon: toLon };
      return { lat: fromLat, lon: fromLon };
    }
    if (isValidMapCoord(destLat, destLon)) return { lat: destLat, lon: destLon };
    if (isValidMapCoord(toLat, toLon)) return { lat: toLat, lon: toLon };
    return { lat: fromLat, lon: fromLon };
  }, [isPickupPhase, pickupLat, pickupLon, destLat, destLon, toLat, toLon, fromLat, fromLon]);

  const initialNavCamera = useMemo(() => {
    const lat = isValidMapCoord(fromLat, fromLon) ? fromLat : 48.7394;
    const lon = isValidMapCoord(fromLat, fromLon) ? fromLon : 9.3114;
    const heading = resolveNavFallbackBearing(lat, lon, { target: navigationTarget });
    return buildNavCamera(lat, lon, heading);
  }, [fromLat, fromLon, navigationTarget.lat, navigationTarget.lon]);

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
  const navCameraInitializedRef = useRef(false);
  const pendingNavCameraRef = useRef<{ lat: number; lon: number; heading?: number } | null>(null);
  /** Auto-follow (GPS camera). Off after user pans; pinch-zoom bleibt erlaubt und wird gemerkt. */
  const navFollowEnabledRef = useRef(true);
  /** Ignore region-change events briefly after animateCamera / fitToCoordinates. */
  const programmaticCameraUntilRef = useRef(0);
  /** Nutzer-Zoom / Altitude merken — Follow darf Pinch nicht auf Default zurücksetzen. */
  const preferredZoomRef = useRef(NAV_CAMERA_ZOOM);
  const preferredAltitudeRef = useRef<number | null>(null);
  /** Während Pinch/Pan: kurz keine Follow-animateCamera (sonst stirbt die Geste). */
  const userGestureCameraPauseUntilRef = useRef(0);
  /** Heading: Speed-Gate + EMA/Deadband/Rate-Limit (nicht Roh-GPS). */
  const navHeadingSmootherRef = useRef<NavHeadingSmootherState>(createNavHeadingSmootherState());
  const navPositionSmootherRef = useRef<NavPositionSmootherState>(createNavPositionSmootherState());
  /** Einzige Pose für Kamera + Puck — Heading nur über applyDriverNavFix / Smoother. */
  const navPoseRef = useRef<{ lat: number; lon: number; heading: number | null }>({
    lat: fromLat || 48.7394,
    lon: fromLon || 9.3117,
    heading: null,
  });
  const lastRawFixRef = useRef<{ lat: number; lon: number; atMs: number } | null>(null);
  const lastCameraPoseRef = useRef<{ lat: number; lon: number; heading: number } | null>(null);
  /** Off-Route → Reroute (Debounce + Cooldown). */
  const offRouteTrackerRef = useRef<OffRouteTrackerState>(createOffRouteTrackerState());
  const rerouteInFlightRef = useRef(false);
  const lastRerouteAtMsRef = useRef<number | null>(null);
  const driverArrivingSentRef = useRef(false);

  const [polyline, setPolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [steps, setSteps]       = useState<RouteStep[]>([]);
  const [stepIdx, setStepIdx]   = useState(0);
  const prevStepIdx = useRef(-1);
  const polylineLatLonRef = useRef<{ lat: number; lon: number }[]>([]);
  /** loading | retrying | ready | failed — nie dauerhaft Luftlinie als „Route“. */
  const [navRouteLoadState, setNavRouteLoadState] = useState<
    "loading" | "retrying" | "ready" | "failed"
  >("loading");
  const navRouteReadyRef = useRef(false);

  const [initialDistM, setInitialDistM] = useState(0);
  const [initialEtaMin, setInitialEtaMin] = useState(0);
  const [remainingDistM, setRemainingDistM] = useState(0);
  const [remainingMin, setRemainingMin]     = useState(0);
  /** Live-Meter bis zum aktuellen Manöver-Punkt (entlang Polyline). */
  const [distToManeuverM, setDistToManeuverM] = useState(0);

  const [driverLat, setDriverLat] = useState(fromLat || 48.7394);
  const [driverLon, setDriverLon] = useState(fromLon || 9.3114);

  /** Stable refs for GPS/camera callbacks — avoid effect re-runs on every position tick. */
  const driverLatRef = useRef(driverLat);
  const driverLonRef = useRef(driverLon);
  const stepsRef = useRef(steps);
  const stepIdxRef = useRef(stepIdx);
  const navTargetRef = useRef(navigationTarget);
  const initialRouteMetricsRef = useRef({ distM: initialDistM, etaMin: initialEtaMin });
  const remainingMinRef = useRef(remainingMin);
  const remainingDistMRef = useRef(remainingDistM);
  const isPickupPhaseRef = useRef(isPickupPhase);
  driverLatRef.current = driverLat;
  driverLonRef.current = driverLon;
  stepsRef.current = steps;
  stepIdxRef.current = stepIdx;
  navTargetRef.current = navigationTarget;
  initialRouteMetricsRef.current = { distM: initialDistM, etaMin: initialEtaMin };
  remainingMinRef.current = remainingMin;
  remainingDistMRef.current = remainingDistM;
  isPickupPhaseRef.current = isPickupPhase;

  // pickup-phase sequential state
  const [hasArrived, setHasArrived] = useState(params.arrived === "1");
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  /** false bis live-status (oder Client-Heuristik bei Ankunft) die PIN-Pflicht geklärt hat. */
  const [pinGateReady, setPinGateReady] = useState(params.arrived !== "1");
  const [showPassengerPinModal, setShowPassengerPinModal] = useState(false);
  /** Nach 5 Min. Warten am Abholort: Hinweis Chat / losfahren */
  const [showArrivedWaitHint, setShowArrivedWaitHint] = useState(false);
  const arrivedWaitHintShownRef = useRef(false);
  const pinModalAutoOpenedRef = useRef(false);

  // Ton Ein/Aus
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundRef = useRef(true);

  // fare modal
  const [rideFleetStatus, setRideFleetStatus] = useState("accepted");
  const [rideChatEnabledLive, setRideChatEnabledLive] = useState(false);
  const [completingRide, setCompletingRide] = useState(false);
  const [showFareModal, setShowFareModal] = useState(false);
  const [showCashPaymentWarn, setShowCashPaymentWarn] = useState(false);
  const afterCashPaymentWarnRef = useRef<(() => void) | null>(null);
  const [showCashConfirmModal, setShowCashConfirmModal] = useState(false);
  const [cashConfirmBusy, setCashConfirmBusy] = useState(false);
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const [showTipThanksOverlay, setShowTipThanksOverlay] = useState(false);
  const [showPassengerRatingModal, setShowPassengerRatingModal] = useState(false);
  const [passengerRatingSubmitting, setPassengerRatingSubmitting] = useState(false);
  const [rideEarnings, setRideEarnings] = useState<DriverRideEarnings | null>(null);
  const [fareInput, setFareInput] = useState(
    defaultDriverFareInputForCompletion(rideFleetStatus),
  );
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [sliderWidth, setSliderWidth] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<RideChatMessage[]>([]);
  const [chatPartnerDisplayName, setChatPartnerDisplayName] = useState<string | null>(null);
  const [chatReplyTo, setChatReplyTo] = useState<RideChatReplyTarget | null>(null);
  const chatOpenRef = useRef(false);
  const cancelHandledRef = useRef(false);
  const abortFarePromptedRef = useRef(false);

  const rideChatEnabled = activeRide?.chatEnabled === true || rideChatEnabledLive;
  const {
    unread: chatUnread,
    clearUnread: clearChatUnread,
    markReadFromMessages,
    notifyIncoming: notifyChatIncoming,
  } = useFleetRideChatUnread(
    isPrivateMemo ? "" : (params.rideId?.trim() ?? ""),
    isPrivateMemo ? false : rideChatEnabled,
    chatOpen,
  );
  const rideChatCanSend = isRideChatSendAllowed(
    (activeRide?.status ?? rideFleetStatus) as RequestStatus,
    rideChatEnabled,
  );

  const hadActiveRideInListRef = useRef(false);
  const prevListedRideRef = useRef<RequestStatus | null>(null);
  const exitAfterCustomerCancelRef = useRef<(cancelReason?: string | null) => void>(() => {});
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
    snapDriveSheet(false);
    if (isDrivingPhase) {
      setChatOpen(false);
      clearChatUnread();
    }
  }, [clearChatUnread, isDrivingPhase, isPrivateMemo, phase, snapDriveSheet]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  const sendDriverChatMessage = useCallback(async () => {
    const msg = chatInput.trim();
    const rideId = params.rideId?.trim() ?? "";
    if (!msg || !rideId) return;
    if (!rideChatCanSend) return;
    const reply = chatReplyTo ?? undefined;
    const clientMessageId = `dm-${Date.now()}`;
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
    setChatInput("");
    setChatReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const headers = await fleetAuthHeadersJson();
      const result = await sendFleetRideChatMessage(rideId, msg, headers, clientMessageId);
      if (result.ok) {
        setChatMsgs((prev) => mergeRideChatMessages(prev, apiMessageToRideChatMessage(result.message)));
      }
    } catch {
      /* pending bleibt bis WS/Reload */
    }
  }, [chatInput, chatReplyTo, params.rideId, rideChatCanSend]);

  useEffect(() => {
    setChatMsgs([]);
    setChatInput("");
    clearChatUnread();
    setChatReplyTo(null);
  }, [clearChatUnread, params.rideId]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!chatOpen || !rideId || !rideChatEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await fleetAuthHeadersJson();
        const { items, partnerDisplayName } = await fetchFleetRideChatMessages(rideId, headers);
        if (!cancelled) {
          if (partnerDisplayName) setChatPartnerDisplayName(partnerDisplayName);
          const mapped = rideChatMessagesFromApi(items);
          setChatMsgs((prev) => mergeRideChatMessagesFromApi(prev, mapped));
          markReadFromMessages(items);
        }
      } catch {
        /* ignore */
      }
    })();
    const poll = setInterval(() => {
      void (async () => {
        try {
          const headers = await fleetAuthHeadersJson();
          const { items, partnerDisplayName } = await fetchFleetRideChatMessages(rideId, headers);
          if (!cancelled) {
            if (partnerDisplayName) setChatPartnerDisplayName(partnerDisplayName);
            const mapped = rideChatMessagesFromApi(items);
            setChatMsgs((prev) => mergeRideChatMessagesFromApi(prev, mapped));
            markReadFromMessages(items);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [chatOpen, markReadFromMessages, params.rideId, rideChatEnabled]);

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

  const markProgrammaticCamera = useCallback((durationMs: number) => {
    // iOS feuert oft noch Region-Events nach animateCamera — Puffer großzügig halten.
    programmaticCameraUntilRef.current = Date.now() + Math.max(durationMs, 0) + 1200;
  }, []);

  const fitRoute = useCallback((coords: { latitude: number; longitude: number }[]) => {
    if (coords.length < 2 || !mapReady.current) return;
    navFollowEnabledRef.current = false;
    markProgrammaticCamera(900);
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 180, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
  }, [markProgrammaticCamera]);

  const applyDriverNavFix = useCallback(
    (input: {
      lat: number;
      lon: number;
      speedMps?: number | null;
      courseDeg?: number | null;
      nowMs?: number;
    }): { lat: number; lon: number; heading: number | null } => {
      const now = input.nowMs ?? Date.now();
      const posTick = tickNavPosition(navPositionSmootherRef.current, input.lat, input.lon);
      navPositionSmootherRef.current = posTick.state;
      const lat = posTick.lat;
      const lon = posTick.lon;

      let movementBearing: number | null = null;
      let derivedSpeedMps: number | null = null;
      const prevRaw = lastRawFixRef.current;
      if (prevRaw && isValidMapCoord(prevRaw.lat, prevRaw.lon)) {
        const moved = haversine(prevRaw.lat, prevRaw.lon, input.lat, input.lon);
        const dtSec = Math.max(0.05, (now - prevRaw.atMs) / 1000);
        if (moved >= 1) {
          derivedSpeedMps = moved / dtSec;
        }
        if (moved >= 3) {
          movementBearing = bearingDeg(prevRaw.lat, prevRaw.lon, input.lat, input.lon);
        }
      }
      lastRawFixRef.current = { lat: input.lat, lon: input.lon, atMs: now };

      const effectiveSpeed = resolveNavSpeedMps(input.speedMps, derivedSpeedMps);

      const polyBearing = bearingAlongPolylineLookaheadDeg(polylineLatLonRef.current, {
        lat,
        lon,
      });
      const fallback = resolveNavFallbackBearing(lat, lon, {
        steps: stepsRef.current,
        stepIdx: stepIdxRef.current,
        target: navTargetRef.current,
      });
      const headingTick = tickNavHeading(navHeadingSmootherRef.current, {
        speedMps: effectiveSpeed,
        courseDeg: input.courseDeg,
        polylineBearingDeg: polyBearing,
        movementBearingDeg: movementBearing,
        fallbackBearingDeg: fallback,
        nowMs: now,
      });
      navHeadingSmootherRef.current = headingTick.state;
      navPoseRef.current = { lat, lon, heading: headingTick.heading };
      return { lat, lon, heading: headingTick.heading };
    },
    [],
  );

  const focusNavigationCamera = useCallback(
    (opts?: {
      lat?: number;
      lon?: number;
      heading?: number;
      animated?: boolean;
      force?: boolean;
      /** Follow-Tick während Stillstand: Heading nicht mitdrehen. */
      still?: boolean;
      resetZoom?: boolean;
    }) => {
      if (opts?.force) {
        navFollowEnabledRef.current = true;
      } else if (!navFollowEnabledRef.current) {
        return;
      }

      const pose = navPoseRef.current;
      let lat = opts?.lat ?? pose.lat;
      let lon = opts?.lon ?? pose.lon;
      if (!isValidMapCoord(lat, lon)) return;

      /**
       * Heading nur aus der Pose-Pipeline (applyDriverNavFix / Smoother).
       * Kein Roh-Fallback hier — der konkurriert sonst mit geglätteten GPS-Ticks → Zittern.
       */
      let heading: number | null = null;
      if (opts?.still && lastCameraPoseRef.current && isUsableCourse(lastCameraPoseRef.current.heading)) {
        heading = lastCameraPoseRef.current.heading;
      } else if (isUsableCourse(opts?.heading)) {
        heading = opts.heading;
      } else if (isUsableCourse(pose.heading)) {
        heading = pose.heading;
      } else {
        const boot = applyDriverNavFix({
          lat,
          lon,
          speedMps: 0,
          courseDeg: null,
        });
        lat = boot.lat;
        lon = boot.lon;
        heading = boot.heading;
      }
      if (!isUsableCourse(heading)) return;

      if (!opts?.force && lastCameraPoseRef.current && navCameraInitializedRef.current) {
        const prev = lastCameraPoseRef.current;
        const movedM = haversine(prev.lat, prev.lon, lat, lon);
        const dHead = Math.abs(shortestRotationDelta(prev.heading, heading));
        const minMove = opts?.still ? NAV_CAMERA_STILL_MIN_MOVE_M : NAV_CAMERA_MIN_MOVE_M;
        if (movedM < minMove && (opts?.still || dHead < NAV_CAMERA_MIN_HEADING_DELTA_DEG)) {
          return;
        }
      }

      if (opts?.resetZoom || opts?.force) {
        preferredZoomRef.current = NAV_CAMERA_ZOOM;
        preferredAltitudeRef.current = null;
      }

      if (!mapReady.current || !mapRef.current) {
        pendingNavCameraRef.current = { lat, lon, heading };
        return;
      }

      const duration =
        opts?.animated === false
          ? 0
          : opts?.still
            ? 0
            : navCameraInitializedRef.current
              ? NAV_CAMERA_FOLLOW_DURATION_MS
              : 0;
      markProgrammaticCamera(duration);
      mapRef.current.animateCamera(
        buildNavCamera(lat, lon, heading, {
          zoom: preferredZoomRef.current,
          altitude: preferredAltitudeRef.current,
        }),
        { duration },
      );
      navCameraInitializedRef.current = true;
      pendingNavCameraRef.current = null;
      lastCameraPoseRef.current = { lat, lon, heading };
    },
    [applyDriverNavFix, markProgrammaticCamera],
  );

  const handleRecenterNav = useCallback(() => {
    void (async () => {
      let lat = driverLatRef.current;
      let lon = driverLonRef.current;
      let speedMps: number | null = null;
      let courseDeg: number | null = null;
      const fresh = await getCurrentPositionSafe({ accuracy: Location.Accuracy.BestForNavigation });
      if (fresh && isValidMapCoord(fresh.coords.latitude, fresh.coords.longitude)) {
        lat = fresh.coords.latitude;
        lon = fresh.coords.longitude;
        speedMps = fresh.coords.speed;
        courseDeg = fresh.coords.heading;
      }
      const pose = applyDriverNavFix({ lat, lon, speedMps, courseDeg });
      setDriverLat(pose.lat);
      setDriverLon(pose.lon);
      focusNavigationCamera({
        lat: pose.lat,
        lon: pose.lon,
        heading: pose.heading ?? undefined,
        animated: true,
        force: true,
        resetZoom: true,
      });
    })();
  }, [applyDriverNavFix, focusNavigationCamera]);

  /** Pan verschiebt den Fokus → Follow aus. Pinch-Zoom wird über Region gemerkt und bleibt im Follow. */
  const handleMapUserInteraction = useCallback(() => {
    if (Date.now() < programmaticCameraUntilRef.current) return;
    navFollowEnabledRef.current = false;
    userGestureCameraPauseUntilRef.current = Date.now() + 1200;
  }, []);

  const handleRegionChange = useCallback(() => {
    if (Date.now() < programmaticCameraUntilRef.current) return;
    // Pinch startet oft ohne onPanDrag — Follow-Kamera kurz pausieren, Zoom behalten.
    userGestureCameraPauseUntilRef.current = Date.now() + 900;
  }, []);

  const handleRegionChangeComplete = useCallback(() => {
    if (Date.now() < programmaticCameraUntilRef.current) return;
    void (async () => {
      try {
        const cam = await mapRef.current?.getCamera();
        if (!cam) return;
        if (typeof cam.zoom === "number" && Number.isFinite(cam.zoom)) {
          preferredZoomRef.current = cam.zoom;
        }
        if (typeof cam.altitude === "number" && Number.isFinite(cam.altitude)) {
          preferredAltitudeRef.current = cam.altitude;
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);
  useEffect(() => {
    navHeadingSmootherRef.current = createNavHeadingSmootherState();
    navPositionSmootherRef.current = createNavPositionSmootherState();
    lastRawFixRef.current = null;
    lastCameraPoseRef.current = null;
    navPoseRef.current = {
      lat: driverLatRef.current,
      lon: driverLonRef.current,
      heading: null,
    };
  }, [params.rideId]);

  useEffect(() => {
    navCameraInitializedRef.current = false;
    navFollowEnabledRef.current = true;
    preferredZoomRef.current = NAV_CAMERA_ZOOM;
    preferredAltitudeRef.current = null;
    offRouteTrackerRef.current = createOffRouteTrackerState();
    rerouteInFlightRef.current = false;
    lastRerouteAtMsRef.current = null;
    setStepIdx(0);
    prevStepIdx.current = -1;
  }, [params.rideId, phase]);

  useEffect(() => {
    if (!mapReady.current) return;
    const pose = navPoseRef.current;
    focusNavigationCamera({
      lat: pose.lat,
      lon: pose.lon,
      heading: pose.heading ?? undefined,
      animated: true,
      force: true,
    });
  }, [phase, navigationTarget.lat, navigationTarget.lon, focusNavigationCamera]);

  const shareRouteWithCustomer = useCallback(
    (
      points: { lat: number; lon: number }[],
      metrics: { etaMinutes: number; remainingDistM: number },
    ) => {
      if (isPrivateMemo) return;
      const sampled = downsampleRoutePolyline(points);
      if (sampled.length < 2) return;
      const polylinePairs = polylinePairsFromLatLon(sampled);
      const navPhase = isPickupPhase ? ("pickup" as const) : ("destination" as const);
      sendDriverNavRoute({
        polyline: polylinePairs,
        etaMinutes: metrics.etaMinutes,
        remainingDistM: metrics.remainingDistM,
        navPhase,
      });
      const rideId = params.rideId?.trim();
      if (!rideId) return;
      void (async () => {
        try {
          const headers = await fleetAuthHeadersJson();
          await fetch(`${API_BASE}/rides/${encodeURIComponent(rideId)}/driver-nav-route`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              polyline: polylinePairs,
              etaMinutes: metrics.etaMinutes,
              remainingDistM: metrics.remainingDistM,
              navPhase,
            }),
          });
        } catch {
          /* ignore */
        }
      })();
    },
    [isPrivateMemo, isPickupPhase, params.rideId],
  );

  const applyNavRouteResult = useCallback(
    (
      result: DriverNavRouteResult,
      fallbackFrom: { lat: number; lon: number },
      fallbackTo: { lat: number; lon: number },
      opts?: { refocusCamera?: boolean },
    ): boolean => {
      const coords = (result.polyline ?? []).map(([lat, lon]) => ({
        latitude: lat,
        longitude: lon,
      }));
      const latLon = coords.map((c) => ({ lat: c.latitude, lon: c.longitude }));
      // Keine 2-Punkt-Luftlinie: echte OSRM-Geometrie hat i. d. R. viele Punkte.
      if (coords.length < 2 || latLon.length < 2) {
        return false;
      }
      if (coords.length === 2) {
        const a = latLon[0]!;
        const b = latLon[1]!;
        if (haversine(a.lat, a.lon, b.lat, b.lon) > 80) {
          return false;
        }
      }
      polylineLatLonRef.current = latLon;
      setPolyline(coords);
      setSteps(result.steps);
      setStepIdx(0);
      prevStepIdx.current = -1;
      navRouteReadyRef.current = true;
      setNavRouteLoadState("ready");
      const distM = (result.distanceKm ?? 0) * 1000;
      const etaMin = result.durationMinutes ?? 0;
      setInitialDistM(distM);
      setInitialEtaMin(etaMin);
      const lat = isValidMapCoord(driverLatRef.current, driverLonRef.current)
        ? driverLatRef.current
        : fallbackFrom.lat;
      const lon = isValidMapCoord(driverLatRef.current, driverLonRef.current)
        ? driverLonRef.current
        : fallbackFrom.lon;
      let remDist = distM;
      let remMin = Math.max(1, etaMin);
      const along = remainingAlongPolyline(polylineLatLonRef.current, { lat, lon });
      if (along && distM > 0) {
        const scaled = scaleRemainingToAuthoritative(along, distM, etaMin);
        remDist = scaled.remainingDistM;
        remMin = scaled.remainingMin;
        setRemainingDistM(remDist);
        setRemainingMin(remMin);
      } else {
        setRemainingDistM(distM);
        setRemainingMin(Math.max(1, etaMin));
      }
      offRouteTrackerRef.current = createOffRouteTrackerState();
      navFollowEnabledRef.current = true;
      if (opts?.refocusCamera !== false) {
        // Nur geglättete Pose — kein Roh-Heading (Smoother via focusNavigationCamera-Bootstrap).
        const pose = navPoseRef.current;
        focusNavigationCamera({
          lat: isValidMapCoord(pose.lat, pose.lon) ? pose.lat : lat,
          lon: isValidMapCoord(pose.lat, pose.lon) ? pose.lon : lon,
          heading: pose.heading ?? undefined,
          animated: false,
          force: true,
        });
      }
      shareRouteWithCustomer(polylineLatLonRef.current, {
        etaMinutes: remMin,
        remainingDistM: Math.round(remDist),
      });
      return true;
    },
    [focusNavigationCamera, shareRouteWithCustomer],
  );

  const requestNavRouteFrom = useCallback(
    async (
      from: { lat: number; lon: number },
      reason: "initial" | "reroute" | "recover",
      isCancelled?: () => boolean,
    ): Promise<boolean> => {
      const target = navTargetRef.current;
      if (!isValidMapCoord(from.lat, from.lon) || !isValidMapCoord(target.lat, target.lon)) {
        return false;
      }
      const destLabel = isPickupPhaseRef.current ? pickupName : destName;
      try {
        const result = await fetchDriverNavRoute(
          { lat: from.lat, lon: from.lon, displayName: params.fromName ?? "Start" },
          { lat: target.lat, lon: target.lon, displayName: destLabel },
        );
        if (isCancelled?.()) return false;
        logDriverNavigationRouteResult({
          ok: true,
          source: result.routingSource,
          distanceKm: result.distanceKm,
          durationMinutes: result.durationMinutes,
          stepCount: result.steps.length,
          polylinePoints: (result.polyline ?? []).length,
        });
        const applied = applyNavRouteResult(result, from, target, {
          refocusCamera: reason === "initial" || reason === "recover",
        });
        if (!applied) {
          logDriverNavigationRouteResult({
            ok: false,
            source: "error",
            error: "nav_route_polyline_rejected",
            polylinePoints: (result.polyline ?? []).length,
          });
          lastRerouteAtMsRef.current = Date.now();
          return false;
        }
        lastRerouteAtMsRef.current = Date.now();
        return true;
      } catch (e) {
        if (isCancelled?.()) return false;
        logDriverNavigationRouteResult({
          ok: false,
          source: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        // Niemals Luftlinie setzen — alte gute Polyline behalten, sonst leer lassen + Retry.
        lastRerouteAtMsRef.current = Date.now();
        return false;
      }
    },
    [applyNavRouteResult, destName, params.fromName, pickupName],
  );

  // Load route once per ride/phase; bei Fehler Auto-Retry (kein Luftlinien-Fallback).
  useEffect(() => {
    if (Platform.OS === "web") return;

    const tLat = navigationTarget.lat;
    const tLon = navigationTarget.lon;
    if (!isValidMapCoord(tLat, tLon)) return;

    let cancelled = false;
    navRouteReadyRef.current = false;
    setNavRouteLoadState("loading");
    setPolyline([]);
    polylineLatLonRef.current = [];
    setSteps([]);

    const delaysMs = [0, 1200, 2800, 5500, 10_000];

    void (async () => {
      for (let attempt = 0; attempt < delaysMs.length; attempt++) {
        if (cancelled) return;
        const wait = delaysMs[attempt] ?? 0;
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, wait));
          if (cancelled) return;
        }
        if (attempt > 0) setNavRouteLoadState("retrying");

        let fLat = driverLatRef.current;
        let fLon = driverLonRef.current;
        if (!isValidMapCoord(fLat, fLon)) {
          fLat = isPickupPhase ? fromLat : pickupLat || fromLat;
          fLon = isPickupPhase ? fromLon : pickupLon || fromLon;
        }
        if (!isValidMapCoord(fLat, fLon)) continue;

        const ok = await requestNavRouteFrom(
          { lat: fLat, lon: fLon },
          attempt === 0 ? "initial" : "recover",
          () => cancelled,
        );
        if (cancelled) return;
        if (ok) return;
      }
      if (!cancelled) setNavRouteLoadState("failed");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    params.rideId,
    phase,
    isPickupPhase,
    fromLat,
    fromLon,
    pickupLat,
    pickupLon,
    navigationTarget.lat,
    navigationTarget.lon,
    requestNavRouteFrom,
  ]);

  // Speak on step change — skip "Fahrt beginnen" (depart) instructions
  useEffect(() => {
    if (!steps.length || stepIdx === prevStepIdx.current) return;
    prevStepIdx.current = stepIdx;
    const step = steps[stepIdx];
    const instr = step?.instruction ?? "";
    if (!instr || instr === "Fahrt beginnen") return;
    const liveM =
      step && isValidMapCoord(step.lat, step.lon)
        ? distanceAlongPolylineToPointM(
            polylineLatLonRef.current,
            { lat: driverLatRef.current, lon: driverLonRef.current },
            { lat: step.lat, lon: step.lon },
          )
        : null;
    const m =
      liveM ??
      (typeof step?.distanceM === "number" && step.distanceM > 0 ? step.distanceM : 0);
    trySpeak(formatNavTurnCue(m > 0 ? m : 25, instr), soundRef.current);
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
      if (isPrivateMemo) return;
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
        let code = res.status === 429 ? "too_many_requests" : "status_update_failed";
        let errorBody: unknown = null;
        try {
          errorBody = await res.json();
          const body = errorBody as { error?: string };
          if (typeof body?.error === "string" && body.error) code = body.error;
        } catch {
          // ignore
        }
        const err = new Error(code) as Error & { userMessage?: string; errorCode?: string };
        err.errorCode = code;
        const hint = driverRideStatusUserMessage(code, errorBody);
        if (hint) err.userMessage = hint;
        throw err;
      }
    },
    [params.rideId, driverLat, driverLon, isPrivateMemo],
  );

  const handleAngekommen = useCallback(async () => {
    // Ansage sofort — nicht hinter dem Status-PATCH warten (sonst oft „keine Ansage“).
    trySpeak(ARRIVED_PICKUP_SPEAK, soundRef.current, { priority: true });
    setHasArrived(true);
    setShowArrivedWaitHint(false);
    arrivedWaitHintShownRef.current = false;
    pinModalAutoOpenedRef.current = false;
    setPinGateReady(false);
    // Sofort Client-Heuristik: sonst kann Slide „Fahrt beginnen“ vor live-status pinRequired=false lassen.
    if (activeRide && rideRequiresPassengerPinClient(activeRide)) {
      setPinRequired(true);
      setPinVerified(Boolean(activeRide.passengerPinVerifiedAt));
    }
    try {
      await patchStatus("driver_waiting");
    } catch (e) {
      const msg =
        e instanceof Error && typeof (e as Error & { userMessage?: string }).userMessage === "string"
          ? (e as Error & { userMessage?: string }).userMessage
          : e instanceof Error
            ? e.message
            : "Status konnte nicht gesetzt werden.";
      Alert.alert("Angekommen", msg ?? "Status konnte nicht gesetzt werden.");
    }
  }, [patchStatus, activeRide]);

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
        // Countdown zu früh / noch nicht am Abholort — still weiterzählen, kein Alert-Spam
        if (code === "no_show_countdown_active" || code === "no_show_invalid_status") {
          return;
        }
        Alert.alert("No-Show", driverRideStatusUserMessage(code, body) ?? code);
        return;
      }
      await syncNavPresence(null);
      disconnectSocket();
      trySpeak("Kunde nicht erschienen. Fahrt als No-Show abgeschlossen.", soundRef.current);
      setNoShowCountdownEndsAt(null);
      replaceDriverStackExclusive({ pathname: "/driver/dashboard" } as Href);
    } catch {
      Alert.alert("No-Show", "Abschluss fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setNoShowBusy(false);
    }
  }, [noShowBusy, params.rideId]);

  useEffect(() => {
    if (!noShowCountdownEndsAt) return;
    const id = setInterval(() => {
      setNoShowTick((t) => t + 1);
      if (Date.now() >= noShowCountdownEndsAt && hasArrived) {
        void finalizeNoShow();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [noShowCountdownEndsAt, finalizeNoShow, hasArrived]);

  const noShowRemainingSec = noShowCountdownEndsAt
    ? Math.max(0, Math.ceil((noShowCountdownEndsAt - Date.now()) / 1000))
    : 0;

  /** Countdown startet bei Annahme — hier nur Sync der Endzeit (kein „Kunde nicht da“-Button). */
  useEffect(() => {
    if (!params.rideId || isPrivateMemo || !isPickupPhase) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${params.rideId}/driver-no-show/start`, {
          method: "POST",
          headers: await fleetAuthHeadersJson(),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          finalizeAfterIso?: string;
          countdownMinutes?: number;
        };
        if (cancelled || !res.ok || !body.ok) return;
        const endMs = body.finalizeAfterIso
          ? Date.parse(body.finalizeAfterIso)
          : Date.now() + (Number(body.countdownMinutes) || 10) * 60_000;
        if (Number.isFinite(endMs)) setNoShowCountdownEndsAt(endMs);
      } catch {
        /* optional Sync */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.rideId, isPrivateMemo, isPickupPhase]);

  const handleFahrtBeginnen = useCallback(async (): Promise<boolean> => {
    try {
      await patchStatus("in_progress");
      setNoShowCountdownEndsAt(null);
      setShowArrivedWaitHint(false);
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
        bookingPartnerName: params.bookingPartnerName ?? activeRide?.bookingPartnerName ?? "",
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
      return true;
    } catch (e) {
      const err = e as Error & { userMessage?: string; errorCode?: string };
      const code = err.errorCode ?? err.message;
      if (code === "passenger_pin_required") {
        setPinRequired(true);
        setPinVerified(false);
        setShowPassengerPinModal(true);
        return false;
      }
      Alert.alert(
        "Fahrtbeginn fehlgeschlagen",
        err.userMessage ?? err.message ?? "Status konnte nicht gesetzt werden.",
      );
      return false;
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

  useEffect(() => {
    if (!hasArrived || !params.rideId) {
      if (!hasArrived) setPinGateReady(true);
      return;
    }
    let cancelled = false;
    setPinGateReady(false);
    void fetchRidePassengerPinStatus(params.rideId).then((s) => {
      if (cancelled) return;
      const clientNeeds =
        activeRide != null && rideRequiresPassengerPinClient(activeRide);
      const required = s.ok
        ? s.required || clientNeeds
        : clientNeeds; // bei Fetch-Fehler: nicht „PIN optional“ vortäuschen
      const verified = s.ok
        ? s.verified || Boolean(activeRide?.passengerPinVerifiedAt)
        : Boolean(activeRide?.passengerPinVerifiedAt);
      setPinRequired(required);
      setPinVerified(verified);
      setPinGateReady(true);
      if (required && !verified && !pinModalAutoOpenedRef.current) {
        pinModalAutoOpenedRef.current = true;
        // Code-Modal erst nach der Ansage — sonst bricht iOS die Speech oft ab.
        setTimeout(() => {
          if (!cancelled) setShowPassengerPinModal(true);
        }, 4500);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasArrived, params.rideId, activeRide]);

  /**
   * Solange am Abholort nichts weitergeht (kein Losfahren): Ansage jede Minute wiederholen.
   * Erste Ansage kommt bei „Angekommen“ — hier erst ab Minute 1.
   */
  useEffect(() => {
    if (!hasArrived || !isPickupPhase || isPrivateMemo) return;
    const id = setInterval(() => {
      trySpeak(ARRIVED_PICKUP_SPEAK, soundRef.current, { priority: true });
    }, ARRIVED_PICKUP_SPEAK_REPEAT_MS);
    return () => clearInterval(id);
  }, [hasArrived, isPickupPhase, isPrivateMemo]);

  /** 5 Min. nach Ankunft: Meldung + Ansage (Chat / bitte losfahren). */
  useEffect(() => {
    if (!hasArrived || !isPickupPhase || isPrivateMemo) {
      setShowArrivedWaitHint(false);
      return;
    }
    const timer = setTimeout(() => {
      if (arrivedWaitHintShownRef.current) return;
      arrivedWaitHintShownRef.current = true;
      setShowArrivedWaitHint(true);
      trySpeak(
        "Falls der Kunde nicht erscheint, können Sie im Chat schreiben. Bitte losfahren, wenn der Kunde da ist.",
        soundRef.current,
        { priority: true },
      );
      Alert.alert(
        "Kunde nicht da?",
        "Schreiben Sie dem Fahrgast im Chat. Wenn er da ist: Code nehmen und losfahren.",
        rideChatEnabled
          ? [
              { text: "OK", style: "cancel" },
              {
                text: "Chat öffnen",
                onPress: () => {
                  clearChatUnread();
                  setChatOpen(true);
                },
              },
            ]
          : [{ text: "OK" }],
      );
    }, 5 * 60_000);
    return () => clearTimeout(timer);
  }, [hasArrived, isPickupPhase, isPrivateMemo, clearChatUnread, rideChatEnabled]);

  const startRideBySlide = useCallback(async () => {
    if (hasTriggeredSlide.current) return;
    if (!pinGateReady) {
      resetSlide();
      if (pinRequired && !pinVerified) {
        setShowPassengerPinModal(true);
      }
      return;
    }
    if (pinRequired && !pinVerified) {
      resetSlide();
      setShowPassengerPinModal(true);
      return;
    }
    hasTriggeredSlide.current = true;
    try {
      const started = await handleFahrtBeginnen();
      if (!started) hasTriggeredSlide.current = false;
    } catch {
      hasTriggeredSlide.current = false;
    } finally {
      resetSlide();
    }
  }, [handleFahrtBeginnen, resetSlide, pinRequired, pinVerified, pinGateReady]);

  const driveSheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderMove: (_, g) => {
          const base = driveSheetOpenRef.current ? 1 : 0;
          const span = Math.max(1, DRIVE_SHEET_DETAILS_H);
          const next = Math.min(1, Math.max(0, base - g.dy / span));
          driveSheetAnim.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          // Kurzer Tap auf den Handle → Toggle (Google-Maps-ähnlich)
          if (Math.abs(g.dy) < 10 && Math.abs(g.vy) < 0.35) {
            snapDriveSheet(!driveSheetOpenRef.current);
            return;
          }
          driveSheetAnim.stopAnimation((v) => {
            const open = v > 0.42 || g.vy < -0.45 ? true : g.vy > 0.45 ? false : v >= 0.5;
            snapDriveSheet(open);
          });
        },
      }),
    [driveSheetAnim, snapDriveSheet],
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

  const exitAfterCustomerCancel = useCallback(
    (cancelReason?: string | null) => {
      if (cancelHandledRef.current) return;
      cancelHandledRef.current = true;
      void syncNavPresence(null);
      disconnectSocket();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      trySpeak("Die Fahrt wurde vom Kunden storniert.", soundRef.current);
      replaceDriverStackExclusive("/driver/dashboard");
      const reason = typeof cancelReason === "string" ? cancelReason.trim() : "";
      Alert.alert(
        "Kunde hat storniert",
        reason ? `Grund: ${reason}` : "Die Fahrt wurde vom Kunden storniert.",
        [{ text: "OK" }],
        { cancelable: false },
      );
    },
    [syncNavPresence],
  );

  exitAfterCustomerCancelRef.current = exitAfterCustomerCancel;

  const enterAbortAwaitingFare = useCallback(() => {
    if (cancelHandledRef.current) return;
    setRideFleetStatus("customer_abort_pending_fare");
    setShowFareModal(true);
    // Poll/Socket rufen dies wiederholt auf — Fare-Input/Alert nur beim ersten Eintritt.
    const plan = planAbortAwaitingFareEnter(abortFarePromptedRef.current);
    if (plan.markPrompted) {
      abortFarePromptedRef.current = true;
    }
    if (plan.seedFareInput) {
      setFareInput(
        defaultDriverFareInputForCompletion(
          "customer_abort_pending_fare",
          activeRide?.estimatedFare ?? estimatedFare,
          activeRide?.pricingMode,
        ),
      );
    }
    if (!plan.promptDriver) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    trySpeak("Kunde hat die Fahrt abgebrochen. Bitte Taxameter-Preis eingeben.", soundRef.current);
    Alert.alert(
      "Kunde hat abgebrochen",
      "Bitte den Betrag vom Taxameter eingeben.",
      [{ text: "OK" }],
      { cancelable: false },
    );
  }, [activeRide?.estimatedFare, activeRide?.pricingMode, estimatedFare]);

  const enterAbortAwaitingFareRef = useRef(enterAbortAwaitingFare);
  enterAbortAwaitingFareRef.current = enterAbortAwaitingFare;

  const probeFleetRideCancel = useCallback(async () => {
    if (isPrivateMemo) return;
    if (!params.rideId || cancelHandledRef.current) return;
    const rideId = params.rideId.trim();
    const headers = await fleetAuthHeadersJson();
    const urls = [
      `${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/live-status`,
      `${API_BASE}/rides/${encodeURIComponent(rideId)}/fleet-snapshot`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store", headers });
        if (!res.ok) continue;
        const payload = (await res.json()) as {
          status?: string;
          cancelReason?: string | null;
          chatEnabled?: boolean;
        };
        if (typeof payload.status === "string" && payload.status) {
          setRideFleetStatus(payload.status);
        }
        if (typeof payload.chatEnabled === "boolean") {
          setRideChatEnabledLive(payload.chatEnabled);
        }
        if (typeof payload.status === "string" && isCustomerAbortPendingFareStatus(payload.status)) {
          enterAbortAwaitingFareRef.current();
          return;
        }
        if (
          typeof payload.status === "string" &&
          isCustomerFinalCancelledStatus(payload.status as RequestStatus)
        ) {
          exitAfterCustomerCancel(payload.cancelReason);
          return;
        }
        return;
      } catch {
        /* try next */
      }
    }
  }, [exitAfterCustomerCancel, params.rideId, isPrivateMemo]);

  useEffect(() => {
    if (isPrivateMemo) return;
    if (activeRide) hadActiveRideInListRef.current = true;
    const id = params.rideId?.trim() ?? "";
    if (!id) return;
    const listedStatus = activeRide?.status ?? null;
    const prev = prevListedRideRef.current;
    if (listedStatus && isCustomerAbortPendingFareStatus(listedStatus)) {
      enterAbortAwaitingFareRef.current();
    } else if (listedStatus && isCustomerFinalCancelledStatus(listedStatus)) {
      exitAfterCustomerCancel(activeRide?.cancelReason ?? null);
    } else if (prev && !listedStatus && hadActiveRideInListRef.current) {
      void probeFleetRideCancel();
    }
    if (listedStatus) prevListedRideRef.current = listedStatus;
  }, [
    activeRide,
    activeRide?.cancelReason,
    activeRide?.status,
    exitAfterCustomerCancel,
    params.rideId,
    probeFleetRideCancel,
    isPrivateMemo,
  ]);

  useEffect(() => {
    if (isPrivateMemo) {
      setDriverLiveNavigationRideId(null);
      return;
    }
    const rideId = params.rideId?.trim() ?? "";
    setDriverLiveNavigationRideId(rideId || null);
    return () => setDriverLiveNavigationRideId(null);
  }, [params.rideId, isPrivateMemo]);

  useEffect(() => {
    if (isPrivateMemo) return;
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    const unsubCancel = subscribeDriverRideCancelledByCustomer((cancelledId, cancelReason) => {
      if (cancelledId !== rideId) return;
      exitAfterCustomerCancelRef.current(cancelReason);
    });
    const unsubAbort = subscribeDriverRideAbortedAwaitingFare((abortedId) => {
      if (abortedId !== rideId) return;
      enterAbortAwaitingFareRef.current();
    });
    return () => {
      unsubCancel();
      unsubAbort();
    };
  }, [params.rideId, isPrivateMemo]);

  const lastDestinationAlertKeyRef = useRef("");
  const applyCustomerDestinationChange = useCallback(
    (
      destination: { toFull: string; toLat: number; toLon: number },
      opts?: { alert?: boolean },
    ) => {
      if (!isValidMapCoord(destination.toLat, destination.toLon)) return;
      const curDestLat = parseFloat(params.destLat ?? "0");
      const curDestLon = parseFloat(params.destLon ?? "0");
      const sameCoords =
        Math.abs(curDestLat - destination.toLat) < 1e-5 &&
        Math.abs(curDestLon - destination.toLon) < 1e-5;
      const sameName = (params.destName ?? "").trim() === destination.toFull.trim();
      if (sameCoords && sameName) return;

      const label = destination.toFull.trim() || "Neues Ziel";
      const lat = String(destination.toLat);
      const lon = String(destination.toLon);
      if (isDrivingPhase) {
        setDriverNavigationPhaseParams({
          toLat: lat,
          toLon: lon,
          toName: label,
          destLat: lat,
          destLon: lon,
          destName: label,
        });
      } else {
        setDriverNavigationPhaseParams({
          destLat: lat,
          destLon: lon,
          destName: label,
        });
      }
      if (opts?.alert !== false) {
        const alertKey = `${destination.toLat.toFixed(5)},${destination.toLon.toFixed(5)}`;
        if (lastDestinationAlertKeyRef.current !== alertKey) {
          lastDestinationAlertKeyRef.current = alertKey;
          Alert.alert("Achtung: Ziel wurde geändert", label);
        }
      }
    },
    [
      isDrivingPhase,
      params.destLat,
      params.destLon,
      params.destName,
    ],
  );
  const applyCustomerDestinationChangeRef = useRef(applyCustomerDestinationChange);
  applyCustomerDestinationChangeRef.current = applyCustomerDestinationChange;

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    return subscribeDriverDestinationChanged((changedId, destination) => {
      if (changedId !== rideId) return;
      applyCustomerDestinationChangeRef.current(destination);
    });
  }, [params.rideId]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    let sub: { remove: () => void } | null = null;
    void import("expo-notifications").then((Notifications) => {
      sub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as {
          kind?: unknown;
          rideId?: unknown;
          toFull?: unknown;
          toLat?: unknown;
          toLon?: unknown;
        };
        if (data.kind === "ride_aborted_awaiting_fare") {
          if (typeof data.rideId === "string" && data.rideId.trim() === rideId) {
            enterAbortAwaitingFareRef.current();
          }
          return;
        }
        if (data.kind === "ride_cancelled_by_customer") {
          if (typeof data.rideId === "string" && data.rideId.trim() === rideId) {
            exitAfterCustomerCancelRef.current(null);
          }
          return;
        }
        if (data.kind !== "ride_destination_changed") return;
        if (typeof data.rideId !== "string" || data.rideId.trim() !== rideId) return;
        const toLat =
          typeof data.toLat === "number"
            ? data.toLat
            : typeof data.toLat === "string"
              ? Number(data.toLat)
              : NaN;
        const toLon =
          typeof data.toLon === "number"
            ? data.toLon
            : typeof data.toLon === "string"
              ? Number(data.toLon)
              : NaN;
        const toFull = typeof data.toFull === "string" ? data.toFull : "Neues Ziel";
        applyCustomerDestinationChangeRef.current({ toFull, toLat, toLon });
      });
    });
    return () => sub?.remove();
  }, [params.rideId]);

  useEffect(() => {
    if (!activeRide || String(activeRide.id) !== String(params.rideId ?? "")) return;
    const toLat = activeRide.toLat;
    const toLon = activeRide.toLon;
    if (typeof toLat !== "number" || typeof toLon !== "number") return;
    const toFull = (activeRide.toFull ?? activeRide.to ?? "").trim() || "Ziel";
    applyCustomerDestinationChangeRef.current(
      { toFull, toLat, toLon },
      { alert: false },
    );
  }, [activeRide?.id, activeRide?.toLat, activeRide?.toLon, activeRide?.toFull, activeRide?.to, params.rideId]);

  useEffect(() => {
    if (!params.rideId || cancelHandledRef.current || !hadActiveRideInListRef.current) return;
    if (activeRide) return;
    if (isCustomerAbortPendingFareStatus(rideFleetStatus)) {
      enterAbortAwaitingFareRef.current();
      return;
    }
    if (isCustomerFinalCancelledStatus(rideFleetStatus as RequestStatus)) {
      exitAfterCustomerCancel(null);
      return;
    }
    void probeFleetRideCancel();
  }, [activeRide, exitAfterCustomerCancel, params.rideId, probeFleetRideCancel, rideFleetStatus]);

  const onRideWsMessage = useCallback((msg: Record<string, unknown>) => {
    if (msg.type === "ride:status:update" && typeof msg.status === "string") {
      const next = msg.status as RequestStatus;
      setRideFleetStatus(next);
      if (isCustomerAbortPendingFareStatus(next)) {
        enterAbortAwaitingFareRef.current();
      } else if (isCustomerFinalCancelledStatus(next)) {
        exitAfterCustomerCancelRef.current(null);
      }
      return;
    }
    if (msg.type === "ride:destination:update") {
      const toLat =
        typeof msg.toLat === "number"
          ? msg.toLat
          : typeof msg.toLat === "string"
            ? Number(msg.toLat)
            : NaN;
      const toLon =
        typeof msg.toLon === "number"
          ? msg.toLon
          : typeof msg.toLon === "string"
            ? Number(msg.toLon)
            : NaN;
      const toFull =
        typeof msg.toFull === "string"
          ? msg.toFull
          : typeof msg.to === "string"
            ? msg.to
            : "Neues Ziel";
      applyCustomerDestinationChangeRef.current({ toFull, toLat, toLon });
      return;
    }
    if (msg.type === "chat:ride:update") {
      const row = parseRideChatUpdate(msg);
      if (!row) return;
      setChatMsgs((prev) => mergeRideChatMessages(prev, row));
      if (row.from !== "driver") notifyChatIncoming();
    }
  }, [notifyChatIncoming]);

  useEffect(() => {
    if (!params.rideId) return;
    connectToRide(params.rideId, onRideWsMessage, readFleetJwtForWsJoin);
    const reconnectTimer = setInterval(() => {
      if (cancelHandledRef.current || !params.rideId) return;
      connectToRide(params.rideId, onRideWsMessage, readFleetJwtForWsJoin);
    }, 8000);
    return () => {
      clearInterval(reconnectTimer);
      disconnectSocket();
    };
  }, [onRideWsMessage, params.rideId]);

  useEffect(() => {
    if (!params.rideId) return;
    cancelHandledRef.current = false;
    abortFarePromptedRef.current = false;
    void probeFleetRideCancel();
    const timer = setInterval(() => void probeFleetRideCancel(), 2000);
    return () => clearInterval(timer);
  }, [params.rideId, probeFleetRideCancel]);

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
        bookingPartnerName: params.bookingPartnerName ?? "",
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
    void syncNavPresence(rideId);
  }, [params.rideId, syncNavPresence]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncNavPresence(rideId);
      }
    });
    return () => sub.remove();
  }, [params.rideId, syncNavPresence]);

  const fareSettlementPreview = useMemo(() => {
    if (!driverMayBillPositiveFare(rideFleetStatus)) return null;
    const parsed = parseFloat(fareInput.replace(",", "."));
    const grossFromInput = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const gross =
      isFixedPriceRide && agreedFixedPriceEur != null ? agreedFixedPriceEur : grossFromInput;
    const cc = driver?.companyCommission;
    return computeDriverFareSettlementPreview(
      gross,
      cc?.rate ?? 0.1,
      cc?.minCommissionEur,
    );
  }, [fareInput, rideFleetStatus, driver?.companyCommission, isFixedPriceRide, agreedFixedPriceEur]);

  useEffect(() => {
    if (!showFareModal) return;
    void refreshEinsatzbereit();
  }, [showFareModal, refreshEinsatzbereit]);

  const openFareModalAfterRideEnd = useCallback(() => {
    trySpeak("Fahrt wird beendet.", soundRef.current);
    setFareInput(
      defaultDriverFareInputForCompletion(
        rideFleetStatus,
        activeRide?.estimatedFare ?? estimatedFare,
        activeRide?.pricingMode,
      ),
    );
    setShowFareModal(true);
  }, [rideFleetStatus, activeRide?.estimatedFare, activeRide?.pricingMode, estimatedFare]);

  const handleFahrtBeenden = () => {
    if (isFunkDispatch) {
      void completeRideWithFare(0, false);
      return;
    }
    if (driverRidePaymentLooksLikeCash(params.paymentMethod)) {
      afterCashPaymentWarnRef.current = openFareModalAfterRideEnd;
      setShowCashPaymentWarn(true);
      return;
    }
    openFareModalAfterRideEnd();
  };

  const goToDashboardAfterRide = useCallback(() => {
    replaceDriverStackExclusive({
      pathname: "/driver/dashboard",
      params: {
        followUp: "1",
        lastRideId: params.rideId ?? "",
        followUpLat: String(driverLat),
        followUpLon: String(driverLon),
      },
    } as import("expo-router").Href);
  }, [driverLat, driverLon, params.rideId]);

  const showPassengerRatingPrompt = useCallback(() => {
    setShowPassengerRatingModal(true);
  }, []);

  const finishRideFlowToDashboard = useCallback(() => {
    setShowPassengerRatingModal(false);
    goToDashboardAfterRide();
  }, [goToDashboardAfterRide]);

  const submitPassengerRating = useCallback(
    async (stars: number) => {
      const rideId = params.rideId?.trim();
      const token = driver?.authToken;
      if (!rideId || !token) {
        finishRideFlowToDashboard();
        return;
      }
      setPassengerRatingSubmitting(true);
      try {
        await fetch(`${API_BASE}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/passenger-rating`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stars }),
        });
      } catch {
        /* optional */
      } finally {
        setPassengerRatingSubmitting(false);
        finishRideFlowToDashboard();
      }
    },
    [driver?.authToken, finishRideFlowToDashboard, params.rideId],
  );

  const showEarningsThenDashboard = useCallback(async () => {
    const rideId = params.rideId?.trim();
    const token = driver?.authToken;
    if (!rideId || !token) {
      showPassengerRatingPrompt();
      return;
    }
    const earnings = await fetchFleetDriverRideEarnings(rideId, token);
    if (!earnings) {
      showPassengerRatingPrompt();
      return;
    }
    setRideEarnings(earnings);
    if (earnings.tip > 0.005) {
      setShowTipThanksOverlay(true);
    } else {
      setShowEarningsModal(true);
    }
  }, [driver?.authToken, params.rideId, showPassengerRatingPrompt]);

  const finishTipThanksOverlay = useCallback(() => {
    setShowTipThanksOverlay(false);
    setShowEarningsModal(true);
  }, []);

  const completeRideWithFare = async (fare: number, plausibilityAck = false) => {
    setCompletingRide(true);
    try {
      const targetStatus = isCustomerAbortPendingFareStatus(rideFleetStatus)
        ? "cancelled_by_customer"
        : "completed";
      await patchStatus(targetStatus, isFunkDispatch ? 0 : fare, undefined, undefined, plausibilityAck);
      await syncNavPresence(null);
      setShowFareModal(false);
      disconnectSocket();
      trySpeak(
        targetStatus === "cancelled_by_customer"
          ? "Abbruch abgeschlossen. Vielen Dank."
          : isFunkDispatch
            ? "Funk-Fahrt abgeschlossen."
            : "Fahrt abgeschlossen. Vielen Dank.",
        soundRef.current,
      );
      if (isFunkDispatch) {
        goToDashboardAfterRide();
        return;
      }
      if (driverRidePaymentLooksLikeCash(params.paymentMethod)) {
        setShowCashConfirmModal(true);
        return;
      }
      await showEarningsThenDashboard();
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
    if (isFixedPriceRide && driverMayBillPositiveFare(rideFleetStatus)) {
      const agreed = agreedFixedPriceEur;
      if (agreed == null) {
        Alert.alert(
          "Festpreis fehlt",
          "Der vereinbarte Festpreis konnte nicht geladen werden. Bitte kurz warten oder Support kontaktieren.",
        );
        return;
      }
      await completeRideWithFare(agreed, false);
      return;
    }
    const parsed = parseFloat(fareInput.replace(",", "."));
    if (driverMayBillPositiveFare(rideFleetStatus) && (!Number.isFinite(parsed) || parsed <= 0)) {
      Alert.alert("Taxameter-Endpreis", "Bitte den Endpreis vom Taxameter eingeben.");
      return;
    }
    const fare = Number.isFinite(parsed) ? parsed : 0;
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

  // GPS tracking — subscription stable per ride; reads latest state via refs.
  // iOS: timeInterval wird von expo-location ignoriert (nur Android) — distanceInterval steuert die Rate.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    let lastCameraFollowAt = 0;
    void (async () => {
      const fg = await requestForegroundPermissionsSafe();
      if (!fg || fg.status !== "granted") return;
      const boot = await getCurrentPositionSafe({ accuracy: Location.Accuracy.BestForNavigation });
      if (boot) {
        const { latitude, longitude } = boot.coords;
        const pose = applyDriverNavFix({
          lat: latitude,
          lon: longitude,
          speedMps: boot.coords.speed,
          courseDeg: boot.coords.heading,
        });
        setDriverLat(pose.lat);
        setDriverLon(pose.lon);
        if (mapReady.current) {
          focusNavigationCamera({
            lat: pose.lat,
            lon: pose.lon,
            heading: pose.heading ?? undefined,
            animated: false,
            force: true,
          });
        }
      }
      sub = await watchPositionSafe(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          // Android: ~1 Hz. iOS: wirkungslos — siehe distanceInterval.
          timeInterval: 1000,
          // iOS: 2 m — ruhiger als 1 m (weniger Kurs-Jitter).
          distanceInterval: 2,
        },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          const now = Date.now();
          const pose = applyDriverNavFix({
            lat: latitude,
            lon: longitude,
            speedMps: loc.coords.speed,
            courseDeg: loc.coords.heading,
            nowMs: now,
          });
          setDriverLat(pose.lat);
          setDriverLon(pose.lon);

          const { distM, etaMin } = initialRouteMetricsRef.current;
          const along = remainingAlongPolyline(polylineLatLonRef.current, {
            lat: pose.lat,
            lon: pose.lon,
          });
          if (along && distM > 0 && etaMin > 0) {
            const scaled = scaleRemainingToAuthoritative(along, distM, etaMin);
            setRemainingDistM(scaled.remainingDistM);
            setRemainingMin(scaled.remainingMin);
          } else {
            const target = navTargetRef.current;
            const remDist = haversine(pose.lat, pose.lon, target.lat, target.lon);
            setRemainingDistM(remDist);
            if (distM > 0) {
              setRemainingMin(Math.max(1, Math.round(etaMin * Math.min(remDist / distM, 1))));
            }
          }

          const routeSteps = stepsRef.current;
          const curStepIdx = stepIdxRef.current;
          if (routeSteps.length > 0) {
            const isDepartStep = (s: RouteStep | undefined) => {
              const instr = (s?.instruction ?? "").trim().toLowerCase();
              return (
                instr === "fahrt beginnen" ||
                instr.startsWith("fahrt beginnen") ||
                instr === "depart" ||
                instr.includes("abschließen der route")
              );
            };
            // Depart-Steps überspringen — sonst hängt die Kopfzeile bei „Fahrt beginnen“ / 1.7 km.
            let displayIdx = curStepIdx;
            while (displayIdx < routeSteps.length - 1 && isDepartStep(routeSteps[displayIdx])) {
              displayIdx += 1;
            }

            let minD = Infinity;
            let closest = displayIdx;
            for (let i = displayIdx; i < routeSteps.length; i++) {
              const s = routeSteps[i]!;
              if (!isValidMapCoord(s.lat, s.lon)) continue;
              const d = haversine(pose.lat, pose.lon, s.lat, s.lon);
              if (d < minD) {
                minD = d;
                closest = i;
              }
            }
            let nextIdx = displayIdx;
            if (minD < 35 && closest < routeSteps.length - 1) {
              nextIdx = Math.min(closest + 1, routeSteps.length - 1);
              while (nextIdx < routeSteps.length - 1 && isDepartStep(routeSteps[nextIdx])) {
                nextIdx += 1;
              }
            }
            if (nextIdx !== curStepIdx) {
              setStepIdx(nextIdx);
            }
            const activeStep = routeSteps[nextIdx];
            if (activeStep && isValidMapCoord(activeStep.lat, activeStep.lon)) {
              const liveM = distanceAlongPolylineToPointM(
                polylineLatLonRef.current,
                { lat: pose.lat, lon: pose.lon },
                { lat: activeStep.lat, lon: activeStep.lon },
              );
              if (liveM != null) {
                setDistToManeuverM(liveM);
              } else {
                setDistToManeuverM(
                  Math.max(0, Math.round(haversine(pose.lat, pose.lon, activeStep.lat, activeStep.lon))),
                );
              }
            }
          }

          const navRouteReady = initialRouteMetricsRef.current.distM > 0;
          if (!isPrivateMemoRef.current) {
            socketSendDriver(pose.lat, pose.lon, {
              ...(navRouteReady ? { etaMinutes: Math.max(0, remainingMinRef.current) } : {}),
              ...(navRouteReady
                ? { remainingDistM: Math.max(0, Math.round(remainingDistMRef.current)) }
                : {}),
              navPhase: isPickupPhaseRef.current ? "pickup" : "destination",
            });
          }
          if (params.rideId && !isPrivateMemoRef.current) {
            void (async () => {
              try {
                const fix = acceptDriverGpsFix(pose.lat, pose.lon);
                if (!fix) return;
                const headers = await fleetAuthHeadersJson();
                await fetch(`${API_BASE}/rides/${params.rideId}/driver-location`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    lat: fix.lat,
                    lon: fix.lon,
                    ...(navRouteReady ? { etaMinutes: Math.max(0, remainingMinRef.current) } : {}),
                    ...(navRouteReady
                      ? { remainingDistM: Math.max(0, Math.round(remainingDistMRef.current)) }
                      : {}),
                    navPhase: isPickupPhaseRef.current ? "pickup" : "destination",
                  }),
                });
              } catch {
                /* ignore */
              }
            })();
          }

          // Off-Route: Querabstand zur Polyline → bestätigt → Reroute (Cooldown).
          // Ohne echte Route: Recovery-Reroute (ersetzt frühere Luftlinien-Falle).
          if (
            polylineLatLonRef.current.length < 2 &&
            !navRouteReadyRef.current &&
            canStartReroute({
              inFlight: rerouteInFlightRef.current,
              lastRerouteAtMs: lastRerouteAtMsRef.current,
              nowMs: now,
              cooldownMs: 8_000,
            })
          ) {
            rerouteInFlightRef.current = true;
            setNavRouteLoadState((s) => (s === "ready" ? s : "retrying"));
            void requestNavRouteFrom({ lat: pose.lat, lon: pose.lon }, "recover").finally(() => {
              rerouteInFlightRef.current = false;
            });
          } else {
            const distToRouteM = distanceToPolylineM(polylineLatLonRef.current, {
              lat: pose.lat,
              lon: pose.lon,
            });
            const offSample = noteOffRouteSample(offRouteTrackerRef.current, distToRouteM, now);
            offRouteTrackerRef.current = offSample.state;
            if (
              offSample.confirmedOffRoute &&
              canStartReroute({
                inFlight: rerouteInFlightRef.current,
                lastRerouteAtMs: lastRerouteAtMsRef.current,
                nowMs: now,
              })
            ) {
              rerouteInFlightRef.current = true;
              void requestNavRouteFrom({ lat: pose.lat, lon: pose.lon }, "reroute").finally(() => {
                rerouteInFlightRef.current = false;
              });
            }
          }

          if (!navFollowEnabledRef.current) return;
          if (Date.now() < userGestureCameraPauseUntilRef.current) return;

          const still = !isMovingForNavHeading(loc.coords.speed);
          const followInterval = still
            ? NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS
            : NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS;
          if (now - lastCameraFollowAt < followInterval && navCameraInitializedRef.current) {
            return;
          }
          lastCameraFollowAt = now;

          focusNavigationCamera({
            lat: pose.lat,
            lon: pose.lon,
            heading: pose.heading ?? undefined,
            animated: navCameraInitializedRef.current && !still,
            still,
          });
        },
      );
    })();
    return () => {
      sub?.remove();
    };
  }, [params.rideId, focusNavigationCamera, requestNavRouteFrom, applyDriverNavFix]);
  const handleMapReady = useCallback(() => {
    mapReady.current = true;
    logMapsRuntimeDiagnosticsOnce("DriverNavigation.onMapReady");
    logDriverNavigationMapEvent("map_ready", {
      polylinePoints: polyline.length,
      steps: steps.length,
    });
    const pending = pendingNavCameraRef.current;
    if (pending) {
      focusNavigationCamera({
        lat: pending.lat,
        lon: pending.lon,
        heading: pending.heading,
        animated: false,
        force: true,
      });
      return;
    }
    const pose = navPoseRef.current;
    const lat = isValidMapCoord(pose.lat, pose.lon)
      ? pose.lat
      : isValidMapCoord(driverLatRef.current, driverLonRef.current)
        ? driverLatRef.current
        : fromLat || driverLatRef.current;
    const lon = isValidMapCoord(pose.lat, pose.lon)
      ? pose.lon
      : isValidMapCoord(driverLatRef.current, driverLonRef.current)
        ? driverLonRef.current
        : fromLon || driverLonRef.current;
    focusNavigationCamera({
      lat,
      lon,
      heading: pose.heading ?? undefined,
      animated: false,
      force: true,
    });
  }, [fromLat, fromLon, focusNavigationCamera, polyline.length, steps.length]);

  if (Platform.OS === "web") return <WebFallback />;

  const currentStep = steps[stepIdx] ?? null;
  const nextStep    = steps[stepIdx + 1] ?? null;
  const currentParts = currentStep
    ? splitNavStepParts(currentStep)
    : { maneuver: isPickupPhase ? pickupName : destName, roadName: null as string | null };
  const nextParts = nextStep ? splitNavStepParts(nextStep) : null;
  const streetName = currentStep?.instruction ?? (isPickupPhase ? pickupName : destName);
  const liveTurnDistM =
    isPickupPhase && hasArrived && distToPickup > 0
      ? distToPickup
      : distToManeuverM > 0
        ? distToManeuverM
        : currentStep && currentStep.distanceM > 0
          ? currentStep.distanceM
          : null;
  const topDistancePrimary =
    liveTurnDistM != null ? formatNavTurnDistanceLabel(liveTurnDistM) : "";
  /** Manöver-Zeile (ohne Straße); bei Ankunft am Pickup Sonderfall. */
  const topManeuverText =
    isPickupPhase && hasArrived ? "Fahrt beginnen" : currentParts.maneuver || streetName;
  const topRoadName =
    isPickupPhase && hasArrived ? null : currentParts.roadName;

  const bottomInset = insets.bottom;
  const [sheetLayoutH, setSheetLayoutH] = useState(168);
  const floatingControlsBottom = sheetLayoutH + 12;

  const openRideChat = () => {
    clearChatUnread();
    setChatOpen(true);
  };

  const resolvedPaymentMethod =
    (params.paymentMethod ?? "").trim() || (activeRide?.paymentMethod ?? "").trim();
  const resolvedDestRaw =
    destName || activeRide?.toFull?.trim() || activeRide?.to?.trim() || "Ziel";
  const resolvedPickupRaw =
    pickupName || activeRide?.fromFull?.trim() || activeRide?.from?.trim() || "Abholort";

  const paymentUi = resolveNavPaymentUi(resolvedPaymentMethod);

  const resolvedCustomerName =
    params.customerName?.trim() || activeRide?.customerName?.trim() || "";
  const resolvedBookingPartnerName =
    params.bookingPartnerName?.trim() || activeRide?.bookingPartnerName?.trim() || "";

  const { partnerName, passengerName } = driverScheduledPassengerLines(
    resolvedCustomerName,
    resolvedBookingPartnerName,
  );

  const navTripFooterBar = (
    <View
      style={styles.navTripFooter}
      accessibilityRole="summary"
      accessibilityLabel={`Noch ${remainingMin > 0 ? `${remainingMin} Minuten` : "unbekannt"}, ${
        remainingDistM > 0 ? fmtDist(remainingDistM) : "Distanz unbekannt"
      }, Ankunft ${remainingMin > 0 ? fmtArrival(remainingMin) : "unbekannt"}`}
    >
      <View style={styles.navTripFooterCell}>
        <Text style={[styles.navTripFooterValue, navAppleFont("bold")]} numberOfLines={1}>
          {remainingMin > 0 ? `${remainingMin} min` : "—"}
        </Text>
        <Text style={[styles.navTripFooterLabel, navAppleFont("medium")]}>Fahrzeit</Text>
      </View>
      <View style={styles.navTripFooterSep} />
      <View style={styles.navTripFooterCell}>
        <Text style={[styles.navTripFooterValue, navAppleFont("bold")]} numberOfLines={1}>
          {remainingDistM > 0 ? fmtDist(remainingDistM) : "—"}
        </Text>
        <Text style={[styles.navTripFooterLabel, navAppleFont("medium")]}>Distanz</Text>
      </View>
      <View style={styles.navTripFooterSep} />
      <View style={styles.navTripFooterCell}>
        <Text style={[styles.navTripFooterValue, navAppleFont("bold")]} numberOfLines={1}>
          {remainingMin > 0 ? fmtArrival(remainingMin) : "—"}
        </Text>
        <Text style={[styles.navTripFooterLabel, navAppleFont("medium")]}>Ankunft</Text>
      </View>
    </View>
  );

  /** Gleicher Aufbau wie Privatauftrag-Navi: Rail + Abhol-/Zieladresse. */
  const rideDetailsBlock = (
    <View style={styles.privateMemoPanel}>
      {passengerName ? (
        <Text
          style={[styles.privateMemoValue, navAppleFont("semibold"), { marginBottom: partnerName ? 4 : 10 }]}
          numberOfLines={1}
        >
          {passengerName}
        </Text>
      ) : null}
      {partnerName ? (
        <Text
          style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, fontFamily: "Inter_500Medium" }}
          numberOfLines={1}
        >
          {partnerName}
        </Text>
      ) : null}
      <View style={styles.privateMemoMainRow}>
        <View style={styles.privateMemoRouteCol}>
          <View style={styles.privateMemoRouteRow}>
            <View style={styles.privateMemoRail}>
              <View style={styles.privateMemoDotGreen} />
              <View style={styles.privateMemoLine} />
              <View style={styles.privateMemoDotRed} />
            </View>
            <View style={styles.privateMemoPlaces}>
              <Text style={[styles.privateMemoValue, navAppleFont("semibold")]} numberOfLines={2}>
                {resolvedPickupRaw}
              </Text>
              <Text style={[styles.privateMemoValue, navAppleFont("semibold")]} numberOfLines={2}>
                {resolvedDestRaw}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.navPayChip}>
          <MaterialCommunityIcons
            name={paymentUi.icon}
            size={15}
            color={paymentUi.iconColor}
          />
          <Text
            style={[styles.navPayChipText, { color: paymentUi.iconColor }]}
            numberOfLines={1}
          >
            {paymentUi.label}
          </Text>
        </View>
      </View>
    </View>
  );

  const driveDetailsHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, DRIVE_SHEET_DETAILS_H],
  });

  // ─── Bottom action button ───────────────────────────────────────────────────
  let actionBtn: React.ReactNode;
  if (isPrivateMemo) {
    actionBtn = (
      <Pressable
        style={[styles.actionBtn, styles.actionBtnDark]}
        onPress={exitPrivateMemoNav}
        accessibilityLabel="Navi beenden"
      >
        <Text style={styles.actionBtnText}>Navi beenden</Text>
      </Pressable>
    );
  } else if (isPickupPhase) {
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
            <Text style={styles.slideStartHint}>
              {pinRequired && !pinVerified
                ? "Code vom Fahrgast bestätigen (ziehen)"
                : "Nach rechts ziehen, um Fahrt zu beginnen"}
            </Text>
            <Animated.View
              style={[styles.slideStartHandle, { transform: [{ translateX: sliderX }] }]}
            >
              <MaterialCommunityIcons name="car-arrow-right" size={24} color="#fff" />
            </Animated.View>
          </View>
        </View>
      );
    }
  } else {
    actionBtn = null;
  }

  const drivePhaseEndActions = (
    <View style={styles.actionRowPickup}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnGreen, styles.actionBtnPrimarySlot]}
        onPress={handleFahrtBeenden}
      >
        <Feather name="flag" size={20} color="#fff" />
        <Text style={styles.actionBtnText}>{isFunkDispatch ? "Angekommen" : "Fahrt beenden"}</Text>
      </Pressable>
      <Pressable
        onPress={() => setShowCancelReasonModal(true)}
        style={({ pressed }) => [styles.actionCancelX, pressed && { opacity: 0.88 }]}
        accessibilityLabel="Fahrt stornieren"
      >
        <Feather name="x" size={22} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        {...nativeMapViewProps({ androidCustomMapStyle: NIGHT_MAP_STYLE })}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        scrollEnabled
        zoomEnabled
        zoomTapEnabled
        rotateEnabled
        pitchEnabled
        followsUserLocation={false}
        mapPadding={NAV_MAP_PADDING}
        onMapReady={handleMapReady}
        onPanDrag={handleMapUserInteraction}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        initialCamera={initialNavCamera}
      >
        {isValidMapCoord(driverLat, driverLon) ? (
          <Marker
            coordinate={{ latitude: driverLat, longitude: driverLon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            // Nicht flat: Icon bleibt bildschirm-aufrecht → bei Heading-Up-Kamera = Fahrtrichtung
            // (flat ohne rotation würde nach Karten-Norden zeigen und mitdrehen).
            flat={false}
          >
            <View style={styles.navPuckWrap}>
              <View style={styles.navPuck}>
                <MaterialCommunityIcons name="navigation" size={20} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        ) : null}
        {isValidMapCoord(navigationTarget.lat, navigationTarget.lon) ? (
          <Marker
            coordinate={{ latitude: navigationTarget.lat, longitude: navigationTarget.lon }}
            pinColor={isPickupPhase ? "#22C55E" : "#DC2626"}
            title={isPickupPhase ? pickupName : destName}
          />
        ) : null}
        {polyline.length > 1 ? <NavRouteGlowPolyline coordinates={polyline} /> : null}
      </MapView>

      {/* Top instruction card — Google Maps green (auch Privatauftrag: volle Abbiege-Hinweise) */}
      <View
        pointerEvents="box-none"
        style={[styles.topWrapper, { paddingTop: Platform.OS === "ios" ? insets.top : 36 }]}
      >
        <View style={styles.topNavCluster}>
          <View style={styles.topCard}>
            <View style={styles.topMain}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <MaterialCommunityIcons
                  name={maneuverIcon(currentParts.maneuver || currentStep?.instruction || "") as any}
                  size={28}
                  color="#fff"
                />
              </Animated.View>
              <View style={styles.topText}>
                {topDistancePrimary ? (
                  <Text
                    style={[styles.topStreet, !isPickupPhase && styles.topStreetDriving]}
                    numberOfLines={1}
                    allowFontScaling={false}
                  >
                    {topDistancePrimary}
                  </Text>
                ) : (
                  <Text style={styles.topLabel}>Richtung</Text>
                )}
                <Text
                  style={
                    topDistancePrimary
                      ? styles.topManeuver
                      : [styles.topStreet, !isPickupPhase && styles.topStreetDriving]
                  }
                  numberOfLines={1}
                >
                  {topManeuverText}
                </Text>
                {topRoadName ? (
                  <Text style={styles.topRoadName} numberOfLines={1}>
                    {topRoadName}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          {nextStep && nextParts ? (
            <View style={styles.dannPill} accessibilityLabel={`Dann ${nextParts.maneuver}`}>
              <MaterialCommunityIcons
                name={maneuverIcon(nextParts.maneuver) as any}
                size={26}
                color="#1B6B3A"
              />
              <Text style={styles.dannLabel}>Dann</Text>
              <Text style={styles.dannManeuver} numberOfLines={1}>
                {nextParts.maneuver}
              </Text>
            </View>
          ) : null}
        </View>
        {navRouteLoadState !== "ready" ? (
          <Pressable
            style={styles.navRouteStatusPill}
            onPress={() => {
              if (navRouteLoadState !== "failed") return;
              const lat = driverLatRef.current;
              const lon = driverLonRef.current;
              if (!isValidMapCoord(lat, lon)) return;
              setNavRouteLoadState("retrying");
              void requestNavRouteFrom({ lat, lon }, "recover");
            }}
            accessibilityRole="button"
            accessibilityLabel={
              navRouteLoadState === "failed" ? "Route erneut laden" : "Route wird geladen"
            }
          >
            {navRouteLoadState === "failed" ? (
              <Feather name="refresh-cw" size={14} color="#FDE68A" />
            ) : (
              <ActivityIndicator size="small" color="#FDE68A" />
            )}
            <Text style={styles.navRouteStatusText} numberOfLines={1}>
              {navRouteLoadState === "failed"
                ? "Route fehlt — tippen zum Laden"
                : navRouteLoadState === "retrying"
                  ? "Route wird erneut geladen…"
                  : "Route wird geladen…"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Floating button column — Karte/Navi über dem unteren Panel */}
      <View style={{ position: "absolute", right: 12, bottom: floatingControlsBottom, gap: 10 }}>
        <Pressable
          style={styles.compassBtn}
          accessibilityLabel="Navigation folgen"
          onPress={() => handleRecenterNav()}
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
        {rideChatEnabled ? (
          <Pressable
            style={styles.compassBtn}
            accessibilityLabel="Chat mit Kunde"
            onPress={openRideChat}
          >
            <DriverChatBlinkIcon unread={chatUnread} size={20} color="#1B6B3A" />
            {chatUnread ? <View style={styles.navChatBadge} /> : null}
          </Pressable>
        ) : null}
      </View>

      {/* Untere Leiste: Google-ähnlich — Drag-Handle; Höhe = Inhalt + Safe-Area (kein Leerraum) */}
      <Animated.View
        style={[styles.driveBottomSheet, { paddingBottom: bottomInset + 8 }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0) setSheetLayoutH(h);
        }}
      >
        <View
          style={styles.sheetGrabRow}
          {...driveSheetPan.panHandlers}
          accessibilityRole="button"
          accessibilityLabel={driveSheetOpen ? "Leiste einklappen" : "Leiste ausklappen"}
        >
          <View style={styles.sheetGrabHit}>
            <View style={styles.sheetGrabPill} />
          </View>
        </View>

        {navTripFooterBar}

        <Animated.View
          style={{ maxHeight: driveDetailsHeight, opacity: driveSheetAnim, overflow: "hidden" }}
        >
          <View style={styles.driveDetailsWrap}>
            {isPrivateMemo ? (
              <View style={styles.privateMemoPanel}>
                <View style={styles.privateMemoMainRow}>
                  <View style={styles.privateMemoRouteCol}>
                    <View style={styles.privateMemoRouteRow}>
                      <View style={styles.privateMemoRail}>
                        <View style={styles.privateMemoDotGreen} />
                        <View style={styles.privateMemoLine} />
                        <View style={styles.privateMemoDotRed} />
                      </View>
                      <View style={styles.privateMemoPlaces}>
                        <Text style={[styles.privateMemoValue, navAppleFont("semibold")]} numberOfLines={2}>
                          {pickupName}
                        </Text>
                        <Text style={[styles.privateMemoValue, navAppleFont("semibold")]} numberOfLines={2}>
                          {destName}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              rideDetailsBlock
            )}
            {isPickupPhase && noShowCountdownEndsAt ? (
              <Text style={styles.noShowCountdownText}>
                {hasArrived ? "No-Show in" : "Wartezeit Kunde"}{" "}
                {Math.floor(noShowRemainingSec / 60)}:
                {String(noShowRemainingSec % 60).padStart(2, "0")} Min.
                {!hasArrived && noShowRemainingSec <= 0 ? " — am Abholort tippen „Angekommen“" : ""}
              </Text>
            ) : null}
            {isPickupPhase && hasArrived && showArrivedWaitHint ? (
              <Pressable
                onPress={() => {
                  if (!rideChatEnabled) return;
                  clearChatUnread();
                  setChatOpen(true);
                }}
                style={styles.arrivedWaitHint}
              >
                <Feather name="message-circle" size={16} color="#B45309" />
                <Text style={styles.arrivedWaitHintText}>
                  Kunde nicht da? Im Chat schreiben — sonst Code nehmen und losfahren.
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        <View style={styles.driveEndActionWrap}>
          {isPrivateMemo ? (
            <View style={styles.actionBtnWrapper}>{actionBtn}</View>
          ) : isDrivingPhase ? (
            drivePhaseEndActions
          ) : (
            <View style={styles.actionRowPickup}>
              <View style={styles.actionBtnPrimarySlot}>{actionBtn}</View>
              <Pressable
                onPress={() => setShowCancelReasonModal(true)}
                style={({ pressed }) => [styles.actionCancelX, pressed && { opacity: 0.88 }]}
                accessibilityLabel="Fahrt stornieren"
              >
                <Feather name="x" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>

      <DriverPassengerPinModal
        visible={showPassengerPinModal}
        rideId={params.rideId}
        onClose={() => setShowPassengerPinModal(false)}
        onVerified={() => {
          setPinVerified(true);
          setShowPassengerPinModal(false);
          if (hasTriggeredSlide.current) return;
          hasTriggeredSlide.current = true;
          void (async () => {
            try {
              const started = await handleFahrtBeginnen();
              if (!started) hasTriggeredSlide.current = false;
            } catch {
              hasTriggeredSlide.current = false;
            } finally {
              resetSlide();
            }
          })();
        }}
      />

      <DriverCashPaymentWarnModal
        visible={showCashPaymentWarn}
        onCancel={() => {
          setShowCashPaymentWarn(false);
          afterCashPaymentWarnRef.current = null;
        }}
        onConfirm={() => {
          setShowCashPaymentWarn(false);
          const next = afterCashPaymentWarnRef.current;
          afterCashPaymentWarnRef.current = null;
          next?.();
        }}
      />

      {/* Fare Modal */}
      <Modal
        visible={showFareModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isCustomerAbortPendingFareStatus(rideFleetStatus)) setShowFareModal(false);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isCustomerAbortPendingFareStatus(rideFleetStatus)
                  ? "Abbruch – Taxameter"
                  : "Fahrt beenden"}
              </Text>
            </View>
            {driverMayBillPositiveFare(rideFleetStatus) && isFixedPriceRide ? (
              <Text style={styles.modalSubtitle}>
                Vereinbarter Festpreis — keine manuelle Eingabe nötig.
              </Text>
            ) : driverMayBillPositiveFare(rideFleetStatus) ? (
              <>
                {isCustomerAbortPendingFareStatus(rideFleetStatus) ? (
                  <Text style={styles.modalSubtitle}>
                    Kunde hat die Fahrt abgebrochen. Bitte den Betrag vom Taxameter eingeben.
                  </Text>
                ) : null}
                <DriverFareEntryLegalHints
                vehicle={params.vehicle}
                mayBillPositive
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
              </>
            ) : (
              <Text style={styles.modalSubtitle}>
                Keine Fahrt zum Ziel — bitte 0,00 € bestätigen (Kunde wird nicht belastet).
              </Text>
            )}
            {driverMayBillPositiveFare(rideFleetStatus) && isFixedPriceRide ? (
              <View style={[styles.fareBox, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC", alignItems: "center" }]}>
                <Text style={[styles.fareBoxLabel, { color: "#15803D" }]}>Festpreis</Text>
                <Text style={{ fontSize: 32, fontFamily: "Inter_700Bold", color: "#111827" }}>
                  {formatEuro(agreedFixedPriceEur ?? activeRide?.estimatedFare ?? estimatedFare)}
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                  inkl. MwSt. · {CUSTOMER_FIXED_PRICE_LABEL}
                </Text>
              </View>
            ) : driverMayBillPositiveFare(rideFleetStatus) ? (
              <View style={styles.fareBox}>
                <View style={styles.fareInputRow}>
                  <TextInput
                    style={styles.fareInput}
                    value={fareInput}
                    onChangeText={setFareInput}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    placeholder="0,00"
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text style={styles.fareInputSuffix}>€</Text>
                </View>
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
              {!isCustomerAbortPendingFareStatus(rideFleetStatus) ? (
                <Pressable style={styles.cancelBtn} onPress={() => setShowFareModal(false)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.submitBtn, completingRide && { opacity: 0.65 }]}
                onPress={handleConfirmFare}
                disabled={completingRide}
              >
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {completingRide ? "Wird gesendet…" : isFixedPriceRide ? "Fahrt abschließen" : "Abschicken"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCashConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => undefined}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Feather name="dollar-sign" size={26} color="#22C55E" />
              <Text style={styles.modalTitle}>Barzahlung</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Hast du den Fahrpreis in bar vom Kunden erhalten?
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                style={styles.cancelBtn}
                disabled={cashConfirmBusy}
                onPress={() => {
                  setShowCashConfirmModal(false);
                  void showEarningsThenDashboard();
                }}
              >
                <Text style={styles.cancelBtnText}>Später</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, cashConfirmBusy && { opacity: 0.65 }]}
                disabled={cashConfirmBusy}
                onPress={() => {
                  void (async () => {
                    const rideId = params.rideId?.trim();
                    if (!rideId) {
                      setShowCashConfirmModal(false);
                      void showEarningsThenDashboard();
                      return;
                    }
                    setCashConfirmBusy(true);
                    try {
                      const res = await postDriverCashConfirmed(rideId);
                      if (!res.ok) {
                        Alert.alert("Barbestätigung", `Konnte nicht gespeichert werden (${res.error}).`);
                      }
                    } finally {
                      setCashConfirmBusy(false);
                      setShowCashConfirmModal(false);
                      void showEarningsThenDashboard();
                    }
                  })();
                }}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {cashConfirmBusy ? "Wird gespeichert…" : "Bar erhalten"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <DriverTipThanksOverlay visible={showTipThanksOverlay} onFinished={finishTipThanksOverlay} />

      <DriverRideEarningsModal
        visible={showEarningsModal}
        earnings={rideEarnings}
        onClose={() => {
          setShowEarningsModal(false);
          setRideEarnings(null);
          showPassengerRatingPrompt();
        }}
      />

      <DriverPassengerRatingModal
        visible={showPassengerRatingModal}
        customerName={params.customerName}
        submitting={passengerRatingSubmitting}
        onSubmit={(stars) => void submitPassengerRating(stars)}
        onSkip={finishRideFlowToDashboard}
      />

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
                    const outcome = await driverCancelRequest(rideId, driverId);
                    if (outcome?.reservationCancelSanction) {
                      Alert.alert("24h-Sperre aktiv", outcome.reservationCancelSanction.message);
                    }
                  } catch (e) {
                    const code = e instanceof Error ? e.message : "driver_cancel_failed";
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

      <RideChatModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        viewerRole="driver"
        partnerDisplayName={chatPartnerDisplayName}
        messages={chatMsgs}
        canSend={rideChatCanSend}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={sendDriverChatMessage}
        quickReplies={["Ich bin gleich da", "Bin vor Ort", "Bitte kurz warten"]}
        onQuickReply={setChatInput}
        onMessageLongPress={(m) => {
          if (m.from === "driver" || m.from === "customer") {
            setChatReplyTo({ from: m.from, text: m.text });
            Haptics.selectionAsync();
          }
        }}
        replyBanner={
          chatReplyTo ? (
            <RideChatReplyBanner
              replyTo={chatReplyTo}
              viewerRole="driver"
              onClear={() => setChatReplyTo(null)}
            />
          ) : null
        }
        emptyHint="Noch keine Nachricht. Vorlage unten antippen oder selbst tippen."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === "ios" ? "#E5E7EB" : "#242f3e" },
  navPuckWrap: { alignItems: "center", justifyContent: "center" },
  navPuck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },

  /* Top card — kompakt wie Google Maps: schlanke Grün-Karte + „Dann“-Lasche links */
  topWrapper: { position: "absolute", top: 0, left: 0, right: 0 },
  topNavCluster: {
    marginHorizontal: 14,
    marginTop: 2,
    alignItems: "flex-start",
  },
  topCard: {
    alignSelf: "stretch",
    backgroundColor: "#1B6B3A",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  topMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1, minWidth: 0 },
  topLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.78)" },
  topStreet: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 24 },
  topStreetDriving: { fontSize: 22, lineHeight: 26 },
  topManeuver: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.95)",
    marginTop: 1,
    lineHeight: 19,
  },
  topRoadName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.78)",
    marginTop: 1,
  },
  topDist: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.92)", marginTop: 4, lineHeight: 22 },
  navRouteStatusPill: {
    marginTop: 8,
    marginHorizontal: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(253, 230, 138, 0.45)",
  },
  navRouteStatusText: {
    color: "#FDE68A",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 260,
  },
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
  bottomChatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#ECFDF3",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#86EFAC",
  },
  bottomChatRowText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#1B6B3A",
  },
  bottomChatUnreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    marginLeft: 2,
  },
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
  /** Google-ähnlich: kurze weiße Lasche unter der Grün-Karte, links angedockt */
  dannPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "78%",
    gap: 8,
    marginTop: 6,
    marginLeft: 10,
    backgroundColor: "#fff",
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  dannLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#374151",
  },
  dannManeuver: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
    lineHeight: 19,
  },
  dannText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#374151", flex: 1, lineHeight: 20 },

  /* Persistent trip footer — Google-ähnlich: Restzeit / Distanz / ETA */
  navTripFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 0,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: "#111827",
  },
  navTripFooterCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 0,
  },
  navTripFooterValue: {
    fontSize: 17,
    color: "#fff",
    letterSpacing: -0.2,
  },
  navTripFooterLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.62)",
  },
  navTripFooterSep: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: 4,
  },
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
    borderWidth: 1,
    borderColor: PICKUP_AUX_BORDER_LIGHT_RED,
  },
  actionBlockCancelText: {
    color: "#1C1C1E",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    letterSpacing: Platform.OS === "ios" ? -0.24 : 0,
  },
  pickupAuxRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  pickupAuxBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: PICKUP_AUX_BORDER_LIGHT_RED,
  },
  pickupAuxBtnFull: { flex: 1 },
  pickupAuxBtnText: {
    color: "#1C1C1E",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    textAlign: "center",
    letterSpacing: Platform.OS === "ios" ? -0.24 : 0,
  },
  driveBottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingTop: 4,
    paddingHorizontal: 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 20,
    overflow: "hidden",
  },
  sheetGrabRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
    minHeight: DRIVE_SHEET_GRAB_H,
  },
  sheetGrabHit: {
    paddingVertical: 8,
    paddingHorizontal: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetGrabPill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C7C7CC",
  },
  driveStartedBanner: {
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: "#16A34A",
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  driveStartedBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  driveStartedTitle: {
    fontSize: 16,
    color: "#111827",
    letterSpacing: Platform.OS === "ios" ? -0.3 : -0.15,
  },
  driveStartedSub: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
    letterSpacing: Platform.OS === "ios" ? -0.2 : 0,
  },
  driveDetailsWrap: { paddingTop: 2, paddingBottom: 4 },
  driveEndActionWrap: { marginTop: 4, marginBottom: 0 },
  rideInfoCard: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#111827",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 0,
  },
  rideInfoRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  rideInfoRouteLabel: {
    fontSize: 11,
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  rideInfoRoutePlace: {
    fontSize: 17,
    color: "#111827",
    letterSpacing: Platform.OS === "ios" ? -0.35 : -0.2,
  },
  rideInfoRouteAddress: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 18,
  },
  rideInfoRouteDist: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 88,
    paddingLeft: 6,
  },
  rideInfoRouteDistValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    letterSpacing: Platform.OS === "ios" ? -0.4 : 0,
  },
  rideInfoRouteDistLabel: {
    marginTop: 2,
    fontSize: 11,
    color: "#8E8E93",
  },
  rideInfoPartnerFrame: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  rideInfoPartnerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  rideInfoPartnerLabel: {
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  rideInfoPartnerName: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
  },
  rideInfoCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  rideInfoCustomerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "#374151",
  },
  rideInfoNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  rideInfoName: {
    flex: 1,
    minWidth: 0,
    fontSize: 19,
    color: "#111827",
    letterSpacing: Platform.OS === "ios" ? -0.4 : -0.25,
  },
  rideInfoStatsBlock: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  rideInfoPayInBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 44,
    maxWidth: "100%",
  },
  rideInfoPayInBlockCash: {
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 6,
    minWidth: 58,
  },
  rideInfoPayPillTextCash: {
    fontSize: 14,
    letterSpacing: Platform.OS === "ios" ? 0.4 : 0.6,
  },
  rideInfoPayPillText: {
    fontSize: 11,
    maxWidth: 72,
  },
  rideInfoMetric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 2,
    minWidth: 0,
  },
  rideInfoMetricPay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    minWidth: 0,
  },
  rideInfoMetricSep: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#D4D4D8",
    marginVertical: 2,
  },
  rideInfoMetricLabel: {
    fontSize: 14,
    color: "#8E8E93",
    letterSpacing: Platform.OS === "ios" ? 0.1 : 0.2,
    textTransform: "uppercase",
  },
  rideInfoMetricValue: {
    fontSize: 16,
    color: "#1C1C1E",
    letterSpacing: Platform.OS === "ios" ? -0.25 : 0,
    textAlign: "center",
  },
  actionBtnWrapper: { width: "100%" },
  actionRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  /** Angekommen / Beenden nimmt Restbreite, Storno nur kompaktes X (~10 %). */
  actionRowPickup: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  actionBtnPrimarySlot: {
    flex: 1,
    minWidth: 0,
  },
  actionBtnFlex: { flex: 1 },
  actionCancelX: {
    width: 48,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#DC2626",
  },
  actionCancelSide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    minWidth: 96,
  },
  actionCancelSideText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Action buttons */
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  actionBtnGreen: { backgroundColor: "#22C55E" },
  actionBtnDark: { backgroundColor: "#111827" },
  privateMemoPanel: {
    paddingHorizontal: 2,
    marginBottom: 12,
  },
  privateMemoMainRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  privateMemoRouteCol: {
    flex: 1,
    minWidth: 0,
  },
  privateMemoRouteRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  privateMemoRail: {
    width: 14,
    alignItems: "center",
    paddingVertical: 4,
  },
  privateMemoDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  privateMemoLine: {
    flex: 1,
    width: 2,
    minHeight: 16,
    backgroundColor: "#D1D5DB",
    marginVertical: 4,
  },
  privateMemoDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  privateMemoPlaces: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 1,
  },
  privateMemoValue: { fontSize: 15, color: "#111827", lineHeight: 20 },
  privateMemoStatsBox: {
    minWidth: 78,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  /** Kompakter Zahlungs-Chip (kein Grün-Hintergrund bei BAR). */
  navPayChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    minWidth: 0,
    maxWidth: 96,
    backgroundColor: "#F3F4F6",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  navPayChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: Platform.OS === "ios" ? -0.1 : 0,
  },
  privateMemoStatKm: { fontSize: 15, color: "#111827" },
  privateMemoStatMin: { fontSize: 13, color: "#6B7280" },
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
  noShowCountdownText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#B45309",
    textAlign: "center",
    marginBottom: 2,
  },
  arrivedWaitHint: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FCD34D",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  arrivedWaitHintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
    lineHeight: 18,
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
  fareInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  fareInput: {
    flexShrink: 1,
    minWidth: 72,
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    textAlign: "right",
    paddingVertical: 0,
  },
  fareInputSuffix: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  fareBoxLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 8 },
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
  driverChatComposerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  driverChatComposerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    backgroundColor: "#FFFFFF",
    minHeight: 44,
    maxHeight: 96,
    textAlignVertical: "center",
  },
  driverChatSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#128C7E",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  driverChatSendBtnDisabled: { opacity: 0.42 },
  driverChatSendIcon: { marginLeft: 2, marginTop: 1 },
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
