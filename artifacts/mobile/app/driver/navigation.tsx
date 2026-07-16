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
  type TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
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
import { driverPaymentMethodLabelDe } from "@/utils/driverPaymentMethodLabel";
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
} from "@/utils/socket";
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
import { fetchDriverNavRoute } from "@/utils/driverNavRouteApi";
import {
  remainingAlongPolyline,
  scaleRemainingToAuthoritative,
} from "@/utils/routeRemainingAlongPolyline";
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
import { CUSTOMER_FIXED_PRICE_LABEL } from "@/utils/customerFareDisplay";
import { computeDriverFareSettlementPreview } from "@/utils/driverFareSettlementPreview";
import { isCustomerFinalCancelledStatus } from "@/utils/customerRideListFilters";
import {
  setDriverLiveNavigationRideId,
  subscribeDriverDestinationChanged,
  subscribeDriverRideCancelledByCustomer,
} from "@/utils/driverLiveNavigation";
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
const DRIVE_SHEET_GRAB_H = 32;
const DRIVE_SHEET_STATUS_H = 76;
const DRIVE_SHEET_DETAILS_CONTENT_H = 220;
const DRIVE_SHEET_ACTIONS_H = 56;
const DRIVE_SHEET_COLLAPSED_H = DRIVE_SHEET_GRAB_H + DRIVE_SHEET_STATUS_H + 12;
const DRIVE_SHEET_EXPANDED_H =
  DRIVE_SHEET_COLLAPSED_H + DRIVE_SHEET_DETAILS_CONTENT_H + DRIVE_SHEET_ACTIONS_H + 16;
const DRIVE_SHEET_DETAILS_H = DRIVE_SHEET_DETAILS_CONTENT_H + DRIVE_SHEET_ACTIONS_H + 16;

type NavPaymentUi = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  iconColor: string;
  chipBg: string;
};

function resolveNavPaymentUi(paymentMethod: string): NavPaymentUi {
  const pm = (paymentMethod ?? "").trim();
  const lower = pm.toLowerCase();
  if (lower.startsWith("krankenkasse") || lower.includes("kv") || lower.includes("voucher")) {
    return { icon: "ticket-percent-outline", label: "Krankenkasse", iconColor: "#007AFF", chipBg: "#E8F2FF" };
  }
  if (
    lower.includes("karte") ||
    lower.includes("card") ||
    lower.includes("kredit") ||
    lower.includes("paypal") ||
    lower.includes("apple") ||
    lower.includes("google")
  ) {
    return {
      icon: lower.includes("paypal") ? "cellphone" : "credit-card-outline",
      label: pm || "Karte",
      iconColor: "#FF3B30",
      chipBg: "#FFEBEA",
    };
  }
  return { icon: "cash", label: pm || "Bar", iconColor: "#34C759", chipBg: "#E8F8EC" };
}

function splitRideAddress(value?: string | null) {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    place: parts[0] || "",
    address: parts.slice(1).join(", ") || "",
  };
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
const NAV_CAMERA_PITCH = 58;
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

function isUsableDeviceHeading(heading?: number | null): heading is number {
  return heading != null && Number.isFinite(heading) && heading >= 0 && heading <= 360;
}

function resolveNavHeading(
  lat: number,
  lon: number,
  opts: {
    deviceHeading?: number | null;
    steps?: RouteStep[];
    stepIdx?: number;
    target?: { lat: number; lon: number };
  },
): number {
  if (isUsableDeviceHeading(opts.deviceHeading)) return opts.deviceHeading;
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

function buildNavCamera(lat: number, lon: number, heading: number) {
  const center = { latitude: lat, longitude: lon };
  const base = { center, heading, pitch: NAV_CAMERA_PITCH };
  if (usesGoogleMapTiles()) {
    return { ...base, zoom: NAV_CAMERA_ZOOM };
  }
  return { ...base, altitude: zoomLevelToAltitudeMeters(NAV_CAMERA_ZOOM, lat) };
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
    bookingPartnerName?: string;
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

  const { driverCancelRequest, requests, driverMarketRequests, scheduledPoolRequests, driverMarketScheduledPool } = useRideRequests();
  const { driver, refreshEinsatzbereit } = useDriver();
  const driverMarketOnline = Boolean(driver?.einsatzbereit && driver?.isAvailable);
  const syncNavPresence = useCallback(
    async (activeRideId?: string | null) => {
      await syncDriverPresenceState({
        isMarketOnline: driverMarketOnline,
        activeRideId: activeRideId ?? params.rideId?.trim() ?? null,
      });
    },
    [driverMarketOnline, params.rideId],
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
  const isFixedPriceRide = driverSkipsManualFareEntry(activeRide?.pricingMode);
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
    const heading = resolveNavHeading(lat, lon, { target: navigationTarget });
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
  /** Auto-follow (GPS camera). Off after user pans/zooms; re-enabled via recenter button. */
  const navFollowEnabledRef = useRef(true);
  /** Ignore region-change events briefly after animateCamera / fitToCoordinates. */
  const programmaticCameraUntilRef = useRef(0);
  const driverArrivingSentRef = useRef(false);

  const [polyline, setPolyline] = useState<{ latitude: number; longitude: number }[]>([]);
  const [steps, setSteps]       = useState<RouteStep[]>([]);
  const [stepIdx, setStepIdx]   = useState(0);
  const prevStepIdx = useRef(-1);
  const polylineLatLonRef = useRef<{ lat: number; lon: number }[]>([]);

  const [initialDistM, setInitialDistM] = useState(0);
  const [initialEtaMin, setInitialEtaMin] = useState(0);
  const [remainingDistM, setRemainingDistM] = useState(0);
  const [remainingMin, setRemainingMin]     = useState(0);

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
  const [showPassengerPinModal, setShowPassengerPinModal] = useState(false);

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

  const rideChatEnabled = activeRide?.chatEnabled === true || rideChatEnabledLive;
  const {
    unread: chatUnread,
    clearUnread: clearChatUnread,
    markReadFromMessages,
    notifyIncoming: notifyChatIncoming,
  } = useFleetRideChatUnread(params.rideId?.trim() ?? "", rideChatEnabled, chatOpen);
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
    if (!isDrivingPhase) return;
    snapDriveSheet(false);
    setChatOpen(false);
    clearChatUnread();
  }, [clearChatUnread, isDrivingPhase, snapDriveSheet]);

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
    programmaticCameraUntilRef.current = Date.now() + durationMs + 450;
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

  const focusNavigationCamera = useCallback(
    (opts?: { lat?: number; lon?: number; heading?: number; animated?: boolean; force?: boolean }) => {
      if (opts?.force) {
        navFollowEnabledRef.current = true;
      } else if (!navFollowEnabledRef.current) {
        return;
      }

      const lat = opts?.lat ?? driverLatRef.current;
      const lon = opts?.lon ?? driverLonRef.current;
      if (!isValidMapCoord(lat, lon)) return;

      const heading = resolveNavHeading(lat, lon, {
        deviceHeading: opts?.heading,
        steps: stepsRef.current,
        stepIdx: stepIdxRef.current,
        target: navTargetRef.current,
      });

      if (!mapReady.current || !mapRef.current) {
        pendingNavCameraRef.current = { lat, lon, heading };
        return;
      }

      const duration = opts?.animated === false ? 0 : navCameraInitializedRef.current ? 400 : 0;
      markProgrammaticCamera(duration);
      mapRef.current.animateCamera(buildNavCamera(lat, lon, heading), { duration });
      navCameraInitializedRef.current = true;
      pendingNavCameraRef.current = null;
    },
    [markProgrammaticCamera],
  );

  const handleRecenterNav = useCallback(() => {
    void (async () => {
      let lat = driverLatRef.current;
      let lon = driverLonRef.current;
      let heading: number | undefined;
      const fresh = await getCurrentPositionSafe({ accuracy: Location.Accuracy.Balanced });
      if (fresh && isValidMapCoord(fresh.coords.latitude, fresh.coords.longitude)) {
        lat = fresh.coords.latitude;
        lon = fresh.coords.longitude;
        if (isUsableDeviceHeading(fresh.coords.heading)) heading = fresh.coords.heading;
        setDriverLat(lat);
        setDriverLon(lon);
      }
      focusNavigationCamera({ lat, lon, heading, animated: true, force: true });
    })();
  }, [focusNavigationCamera]);

  const handleMapUserInteraction = useCallback(() => {
    navFollowEnabledRef.current = false;
  }, []);

  const handleRegionChange = useCallback(() => {
    if (Date.now() < programmaticCameraUntilRef.current) return;
    navFollowEnabledRef.current = false;
  }, []);

  useEffect(() => {
    navCameraInitializedRef.current = false;
    navFollowEnabledRef.current = true;
    setStepIdx(0);
    prevStepIdx.current = -1;
  }, [params.rideId, phase]);

  useEffect(() => {
    if (!mapReady.current) return;
    focusNavigationCamera({ animated: true, force: true });
  }, [phase, navigationTarget.lat, navigationTarget.lon, focusNavigationCamera]);

  // Load route once per ride/phase via API (Google Matrix → OSRM) — never on every GPS tick.
  useEffect(() => {
    if (Platform.OS === "web") return;

    let fLat = driverLatRef.current;
    let fLon = driverLonRef.current;
    if (!isValidMapCoord(fLat, fLon)) {
      fLat = isPickupPhase ? fromLat : pickupLat || fromLat;
      fLon = isPickupPhase ? fromLon : pickupLon || fromLon;
    }
    const tLat = navigationTarget.lat;
    const tLon = navigationTarget.lon;
    if (!isValidMapCoord(fLat, fLon) || !isValidMapCoord(tLat, tLon)) return;

    const destLabel = isPickupPhase ? pickupName : destName;
    let cancelled = false;
    fetchDriverNavRoute(
      { lat: fLat, lon: fLon, displayName: params.fromName ?? "Start" },
      { lat: tLat, lon: tLon, displayName: destLabel },
    )
      .then((result) => {
        if (cancelled) return;
        const coords = (result.polyline ?? []).map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
        const latLon = coords.map((c) => ({ lat: c.latitude, lon: c.longitude }));
        logDriverNavigationRouteResult({
          ok: true,
          source: result.routingSource,
          distanceKm: result.distanceKm,
          durationMinutes: result.durationMinutes,
          stepCount: result.steps.length,
          polylinePoints: coords.length,
        });
        const appliedCoords =
          coords.length >= 2
            ? coords
            : [
                { latitude: fLat, longitude: fLon },
                { latitude: tLat, longitude: tLon },
              ];
        polylineLatLonRef.current =
          latLon.length >= 2
            ? latLon
            : [
                { lat: fLat, lon: fLon },
                { lat: tLat, lon: tLon },
              ];
        setPolyline(appliedCoords);
        setSteps(result.steps);
        setStepIdx(0);
        prevStepIdx.current = -1;
        const distM = (result.distanceKm ?? 0) * 1000;
        const etaMin = result.durationMinutes ?? 0;
        setInitialDistM(distM);
        setInitialEtaMin(etaMin);
        const lat = isValidMapCoord(driverLatRef.current, driverLonRef.current)
          ? driverLatRef.current
          : fLat;
        const lon = isValidMapCoord(driverLatRef.current, driverLonRef.current)
          ? driverLonRef.current
          : fLon;
        const along = remainingAlongPolyline(polylineLatLonRef.current, { lat, lon });
        if (along && distM > 0) {
          const scaled = scaleRemainingToAuthoritative(along, distM, etaMin);
          setRemainingDistM(scaled.remainingDistM);
          setRemainingMin(scaled.remainingMin);
        } else {
          setRemainingDistM(distM);
          setRemainingMin(Math.max(1, etaMin));
        }
        focusNavigationCamera({ lat, lon, animated: false, force: true });
      })
      .catch((e) => {
        if (cancelled) return;
        logDriverNavigationRouteResult({
          ok: false,
          source: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        const fallbackCoords = [
          { latitude: fLat, longitude: fLon },
          { latitude: tLat, longitude: tLon },
        ];
        polylineLatLonRef.current = [
          { lat: fLat, lon: fLon },
          { lat: tLat, lon: tLon },
        ];
        setPolyline(fallbackCoords);
      });
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
    pickupName,
    destName,
    params.fromName,
    focusNavigationCamera,
  ]);

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
      await syncNavPresence(null);
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

  useEffect(() => {
    if (!hasArrived || !params.rideId) return;
    let cancelled = false;
    void fetchRidePassengerPinStatus(params.rideId).then((s) => {
      if (cancelled) return;
      const required =
        s.required ||
        (activeRide ? rideRequiresPassengerPinClient(activeRide) : false);
      setPinRequired(required);
      setPinVerified(s.verified || Boolean(activeRide?.passengerPinVerifiedAt));
    });
    return () => {
      cancelled = true;
    };
  }, [hasArrived, params.rideId, activeRide]);

  const startRideBySlide = useCallback(async () => {
    if (hasTriggeredSlide.current) return;
    if (pinRequired && !pinVerified) {
      resetSlide();
      setShowPassengerPinModal(true);
      return;
    }
    hasTriggeredSlide.current = true;
    try {
      await handleFahrtBeginnen();
    } finally {
      resetSlide();
    }
  }, [handleFahrtBeginnen, resetSlide, pinRequired, pinVerified]);

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

  const probeFleetRideCancel = useCallback(async () => {
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
  }, [exitAfterCustomerCancel, params.rideId]);

  useEffect(() => {
    if (activeRide) hadActiveRideInListRef.current = true;
    const id = params.rideId?.trim() ?? "";
    if (!id) return;
    const listedStatus = activeRide?.status ?? null;
    const prev = prevListedRideRef.current;
    if (listedStatus && isCustomerFinalCancelledStatus(listedStatus)) {
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
  ]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    setDriverLiveNavigationRideId(rideId || null);
    return () => setDriverLiveNavigationRideId(null);
  }, [params.rideId]);

  useEffect(() => {
    const rideId = params.rideId?.trim() ?? "";
    if (!rideId) return;
    return subscribeDriverRideCancelledByCustomer((cancelledId, cancelReason) => {
      if (cancelledId !== rideId) return;
      exitAfterCustomerCancelRef.current(cancelReason);
    });
  }, [params.rideId]);

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
      if (isCustomerFinalCancelledStatus(next)) {
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
      await patchStatus("completed", fare, undefined, undefined, plausibilityAck);
      await syncNavPresence(null);
      setShowFareModal(false);
      disconnectSocket();
      trySpeak("Fahrt abgeschlossen. Vielen Dank.", soundRef.current);
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
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    void (async () => {
      const fg = await requestForegroundPermissionsSafe();
      if (!fg || fg.status !== "granted") return;
      const boot = await getCurrentPositionSafe({ accuracy: Location.Accuracy.Balanced });
      if (boot) {
        const { latitude, longitude } = boot.coords;
        setDriverLat(latitude);
        setDriverLon(longitude);
        if (mapReady.current) {
          focusNavigationCamera({
            lat: latitude,
            lon: longitude,
            heading: boot.coords.heading ?? undefined,
            animated: false,
            force: true,
          });
        }
      }
      sub = await watchPositionSafe(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setDriverLat(latitude);
          setDriverLon(longitude);

          const { distM, etaMin } = initialRouteMetricsRef.current;
          const along = remainingAlongPolyline(polylineLatLonRef.current, {
            lat: latitude,
            lon: longitude,
          });
          if (along && distM > 0 && etaMin > 0) {
            const scaled = scaleRemainingToAuthoritative(along, distM, etaMin);
            setRemainingDistM(scaled.remainingDistM);
            setRemainingMin(scaled.remainingMin);
          } else {
            const target = navTargetRef.current;
            const remDist = haversine(latitude, longitude, target.lat, target.lon);
            setRemainingDistM(remDist);
            if (distM > 0) {
              setRemainingMin(Math.max(1, Math.round(etaMin * Math.min(remDist / distM, 1))));
            }
          }

          const routeSteps = stepsRef.current;
          const curStepIdx = stepIdxRef.current;
          if (routeSteps.length > 0) {
            let minD = Infinity;
            let closest = curStepIdx;
            routeSteps.forEach((s, i) => {
              if (i < curStepIdx) return;
              const d = haversine(latitude, longitude, s.lat, s.lon);
              if (d < minD) {
                minD = d;
                closest = i;
              }
            });
            if (minD < 30 && closest < routeSteps.length - 1) {
              setStepIdx(Math.min(closest + 1, routeSteps.length - 1));
            }
          }

          const navRouteReady = initialRouteMetricsRef.current.distM > 0;
          socketSendDriver(latitude, longitude, {
            ...(navRouteReady ? { etaMinutes: Math.max(0, remainingMinRef.current) } : {}),
            ...(navRouteReady
              ? { remainingDistM: Math.max(0, Math.round(remainingDistMRef.current)) }
              : {}),
            navPhase: isPickupPhaseRef.current ? "pickup" : "destination",
          });
          if (params.rideId) {
            void (async () => {
              try {
                const fix = acceptDriverGpsFix(latitude, longitude);
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

          if (!navFollowEnabledRef.current) return;

          focusNavigationCamera({
            lat: latitude,
            lon: longitude,
            heading: loc.coords.heading ?? undefined,
            animated: navCameraInitializedRef.current,
          });
        },
      );
    })();
    return () => {
      sub?.remove();
    };
  }, [params.rideId, focusNavigationCamera]);

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
    const lat = isValidMapCoord(driverLatRef.current, driverLonRef.current)
      ? driverLatRef.current
      : fromLat || driverLatRef.current;
    const lon = isValidMapCoord(driverLatRef.current, driverLonRef.current)
      ? driverLonRef.current
      : fromLon || driverLonRef.current;
    focusNavigationCamera({ lat, lon, animated: false, force: true });
  }, [fromLat, fromLon, focusNavigationCamera, polyline.length, steps.length]);

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
  const PICKUP_BOTTOM_PANEL_EST_H = 380;
  const floatingControlsBottom =
    bottomInset +
    (isDrivingPhase
      ? (driveSheetOpen ? DRIVE_SHEET_EXPANDED_H : DRIVE_SHEET_COLLAPSED_H) + 72
      : PICKUP_BOTTOM_PANEL_EST_H);

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
  const routeAddress = splitRideAddress(isPickupPhase ? resolvedPickupRaw : resolvedDestRaw);
  const routeHeaderLabel = isPickupPhase ? "Abholung" : "Ziel";
  const routeIconName = isPickupPhase ? "map-pin" : "flag";
  const routeIconColor = isPickupPhase ? "#16A34A" : "#DC2626";

  const paymentUi = resolveNavPaymentUi(resolvedPaymentMethod);
  const isCashPayment = driverRidePaymentLooksLikeCash(resolvedPaymentMethod);
  const paymentLabel = driverPaymentMethodLabelDe(resolvedPaymentMethod);
  const payIconName = isCashPayment ? ("currency-eur" as const) : paymentUi.icon;
  const payAccentColor = isCashPayment ? "#34C759" : paymentUi.iconColor;
  const payIconSize = isCashPayment ? 20 : 18;

  const resolvedCustomerName =
    params.customerName?.trim() || activeRide?.customerName?.trim() || "";
  const resolvedBookingPartnerName =
    params.bookingPartnerName?.trim() || activeRide?.bookingPartnerName?.trim() || "";

  const { partnerName, passengerName } = driverScheduledPassengerLines(
    resolvedCustomerName,
    resolvedBookingPartnerName,
  );

  const rideDetailsBlock = (
    <View style={styles.rideInfoCard}>
      {partnerName ? (
        <View style={styles.rideInfoPartnerFrame}>
          <View style={styles.rideInfoPartnerHead}>
            <MaterialCommunityIcons name="domain" size={15} color="#374151" />
            <Text style={[styles.rideInfoPartnerLabel, navAppleFont("semibold")]}>Auftraggeber</Text>
          </View>
          <Text style={[styles.rideInfoPartnerName, navAppleFont("bold")]} numberOfLines={2}>
            {partnerName}
          </Text>
        </View>
      ) : null}

      {passengerName ? (
        <View style={styles.rideInfoCustomerRow}>
          <Feather name="user" size={15} color="#6B7280" />
          <Text style={[styles.rideInfoCustomerName, navAppleFont("medium")]} numberOfLines={1}>
            {passengerName}
          </Text>
        </View>
      ) : null}

      <View style={styles.rideInfoRouteRow}>
        <Feather name={routeIconName} size={20} color={routeIconColor} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.rideInfoRouteLabel, navAppleFont("medium")]}>{routeHeaderLabel}</Text>
          <Text style={[styles.rideInfoRoutePlace, navAppleFont("semibold")]} numberOfLines={2}>
            {routeAddress.place || (isPickupPhase ? resolvedPickupRaw : resolvedDestRaw)}
          </Text>
          {routeAddress.address ? (
            <Text style={[styles.rideInfoRouteAddress, navAppleFont("regular")]} numberOfLines={2}>
              {routeAddress.address}
            </Text>
          ) : null}
        </View>
        <View style={styles.rideInfoRouteDist}>
          <Text style={[styles.rideInfoRouteDistValue, navAppleFont("semibold")]} numberOfLines={1}>
            {remainingDistM > 0 ? fmtDist(remainingDistM) : "—"}
          </Text>
          <Text style={[styles.rideInfoRouteDistLabel, navAppleFont("medium")]}>Entfernung</Text>
        </View>
      </View>

      <View style={styles.rideInfoStatsBlock}>
        <View style={styles.rideInfoMetric}>
          <Feather name="clock" size={15} color="#8E8E93" />
          <Text style={[styles.rideInfoMetricLabel, navAppleFont("medium")]}>Ankunft</Text>
          <Text style={[styles.rideInfoMetricValue, navAppleFont("semibold")]} numberOfLines={1}>
            {remainingMin > 0 ? fmtArrival(remainingMin) : "—"}
          </Text>
        </View>
        <View style={styles.rideInfoMetricSep} />
        <View style={styles.rideInfoMetric}>
          <Feather name="watch" size={15} color="#8E8E93" />
          <Text style={[styles.rideInfoMetricLabel, navAppleFont("medium")]}>Fahrzeit</Text>
          <Text style={[styles.rideInfoMetricValue, navAppleFont("semibold")]} numberOfLines={1}>
            {remainingMin > 0 ? `${remainingMin} min` : "—"}
          </Text>
        </View>
        <View style={styles.rideInfoMetricSep} />
        <View style={styles.rideInfoMetricPay}>
          <View
            style={[
              styles.rideInfoPayInBlock,
              isCashPayment && styles.rideInfoPayInBlockCash,
              {
                backgroundColor: isCashPayment ? "#E8F8EC" : paymentUi.chipBg,
                borderColor: isCashPayment ? "#111827" : `${paymentUi.iconColor}55`,
              },
            ]}
          >
            <MaterialCommunityIcons name={payIconName} size={payIconSize} color={payAccentColor} />
            <Text
              style={[
                isCashPayment ? styles.rideInfoPayPillTextCash : styles.rideInfoPayPillText,
                navAppleFont("semibold"),
                { color: payAccentColor },
              ]}
              numberOfLines={1}
            >
              {isCashPayment ? "BAR" : paymentLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const driveSheetHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DRIVE_SHEET_COLLAPSED_H, DRIVE_SHEET_EXPANDED_H],
  });
  const driveDetailsHeight = driveSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, DRIVE_SHEET_DETAILS_H],
  });

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
    <View style={styles.actionRow}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnGreen, styles.actionBtnFlex]}
        onPress={handleFahrtBeenden}
      >
        <Feather name="flag" size={20} color="#fff" />
        <Text style={styles.actionBtnText}>Fahrt beenden</Text>
      </Pressable>
      <Pressable
        onPress={() => setShowCancelReasonModal(true)}
        style={({ pressed }) => [styles.actionCancelSide, pressed && { opacity: 0.9 }]}
        accessibilityLabel="Fahrt stornieren"
      >
        <Feather name="x" size={22} color="#fff" />
        <Text style={styles.actionCancelSideText}>Storno</Text>
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
        initialCamera={initialNavCamera}
      >
        {isValidMapCoord(driverLat, driverLon) ? (
          <Marker coordinate={{ latitude: driverLat, longitude: driverLon }} anchor={{ x: 0.5, y: 0.5 }}>
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

      {/* Top instruction card — Google Maps green */}
      <View
        pointerEvents="box-none"
        style={[styles.topWrapper, { paddingTop: Platform.OS === "ios" ? insets.top : 36 }]}
      >
        <View style={styles.topNavCluster}>
          <View style={styles.topCard}>
            <View style={styles.topMain}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <MaterialCommunityIcons name={maneuverIcon(currentStep?.instruction ?? "") as any} size={32} color="#fff" />
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
          {nextStep ? (
            <View style={styles.dannCard}>
              <MaterialCommunityIcons name={maneuverIcon(nextStep.instruction) as any} size={20} color="#374151" />
              <Text style={styles.dannText} numberOfLines={1}>Dann: {nextStep.instruction}</Text>
            </View>
          ) : null}
        </View>
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
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => snapDriveSheet(!driveSheetOpen)} hitSlop={10} style={styles.sheetChevronBtn}>
              <Feather name={driveSheetOpen ? "chevron-down" : "chevron-up"} size={22} color="#8E8E93" />
            </Pressable>
          </View>

          <View style={styles.driveStartedBanner}>
            <View style={styles.driveStartedBannerInner}>
              <MaterialCommunityIcons name="car-arrow-right" size={20} color="#16A34A" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.driveStartedTitle, navAppleFont("semibold")]}>Die Fahrt hat begonnen</Text>
                <Text style={[styles.driveStartedSub, navAppleFont("regular")]}>Kunde wird abgesetzt</Text>
              </View>
            </View>
          </View>

          <Animated.View style={{ maxHeight: driveDetailsHeight, opacity: driveSheetAnim, overflow: "hidden" }}>
            <View style={styles.driveDetailsWrap}>
              {rideDetailsBlock}
              <View style={styles.driveEndActionWrap}>{drivePhaseEndActions}</View>
            </View>
          </Animated.View>
        </Animated.View>
      ) : (
        <View style={[styles.bottomBar, { paddingBottom: bottomInset }]}>
          {rideDetailsBlock}
          <View style={styles.actionBlock}>
            <View style={styles.actionBtnWrapper}>{actionBtn}</View>
            {isPickupPhase && hasArrived ? (
              <>
                {noShowCountdownEndsAt ? (
                  <Text style={styles.noShowCountdownText}>
                    No-Show in {Math.floor(noShowRemainingSec / 60)}:
                    {String(noShowRemainingSec % 60).padStart(2, "0")} Min.
                  </Text>
                ) : null}
                <View style={styles.pickupAuxRow}>
                  {!noShowCountdownEndsAt ? (
                    <Pressable
                      onPress={() => void handleNoShowStart()}
                      disabled={noShowBusy}
                      style={({ pressed }) => [
                        styles.pickupAuxBtn,
                        pressed && { backgroundColor: PICKUP_AUX_PRESSED_BG },
                        noShowBusy && { opacity: 0.5 },
                      ]}
                    >
                      <Feather name="user-x" size={18} color={PICKUP_AUX_ICON_RED} />
                      <Text style={styles.pickupAuxBtnText}>Kunde nicht da</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setShowCancelReasonModal(true)}
                    style={({ pressed }) => [
                      styles.pickupAuxBtn,
                      noShowCountdownEndsAt ? styles.pickupAuxBtnFull : null,
                      pressed && { backgroundColor: PICKUP_AUX_PRESSED_BG },
                    ]}
                  >
                    <Feather name="x-circle" size={18} color={PICKUP_AUX_ICON_RED} />
                    <Text style={styles.pickupAuxBtnText}>Fahrt stornieren</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setShowCancelReasonModal(true)}
                style={({ pressed }) => [
                  styles.actionBlockCancel,
                  pressed && { backgroundColor: PICKUP_AUX_PRESSED_BG },
                ]}
              >
                <Feather name="x-circle" size={18} color={PICKUP_AUX_ICON_RED} />
                <Text style={styles.actionBlockCancelText}>Fahrt stornieren</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

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
              await handleFahrtBeginnen();
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
      <Modal visible={showFareModal} transparent animationType="slide" onRequestClose={() => setShowFareModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Fahrt beenden</Text>
            </View>
            {driverMayBillPositiveFare(rideFleetStatus) && isFixedPriceRide ? (
              <Text style={styles.modalSubtitle}>
                Vereinbarter Festpreis — keine manuelle Eingabe nötig.
              </Text>
            ) : driverMayBillPositiveFare(rideFleetStatus) ? (
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
              <Pressable style={styles.cancelBtn} onPress={() => setShowFareModal(false)}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </Pressable>
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

  /* Top card */
  topWrapper: { position: "absolute", top: 0, left: 0, right: 0 },
  topNavCluster: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  topCard: { backgroundColor: "#1B6B3A", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 },
  topMain: { flexDirection: "row", alignItems: "center", gap: 14 },
  topText: { flex: 1 },
  topLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.78)" },
  topStreet: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 27 },
  topStreetDriving: { fontSize: 26, lineHeight: 31 },
  topDist: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.84)", marginTop: 3 },
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
  dannCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  dannText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#374151", flex: 1, lineHeight: 20 },

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
    minHeight: DRIVE_SHEET_GRAB_H,
  },
  sheetGrabHit: { paddingVertical: 6, paddingHorizontal: 8, flex: 1, alignItems: "center" },
  sheetGrabPill: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C7C7CC",
  },
  sheetChevronBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  driveStartedBanner: {
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: "#16A34A",
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: DRIVE_SHEET_STATUS_H - 12,
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
  driveDetailsWrap: { paddingTop: 2, paddingBottom: 10 },
  driveEndActionWrap: { marginTop: 12, marginBottom: 4 },
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
    minWidth: 72,
    paddingLeft: 6,
  },
  rideInfoRouteDistValue: {
    fontSize: 15,
    color: "#111827",
    letterSpacing: Platform.OS === "ios" ? -0.2 : 0,
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
  actionBtnFlex: { flex: 1 },
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
  noShowCountdownText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#B45309",
    textAlign: "center",
    marginBottom: 2,
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
