import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RealMapView } from "@/components/RealMapView";
import {
  CUSTOMER_ROUTE_MUTED_BG,
  CustomerRouteStopsPanel,
  formatCustomerReservationPickupInRahmen,
} from "@/components/booking/CustomerRouteStopsPanel";
import { useDriver } from "@/context/DriverContext";
import { type PaymentMethod, useRide } from "@/context/RideContext";
import { type RideRequest, useRideRequests } from "@/context/RideRequestContext";
import type { GeoLocation } from "@/utils/routing";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { customerPayerBlockFromRideRequest, formatCustomerPaymentMethodLabel } from "@/utils/customerBillingCopy";
import {
  CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED,
} from "@/utils/customerRideStatusLabel";
import {
  isCustomerFinalCancelledStatus,
  isCustomerOpenDispatchStatus,
} from "@/utils/customerRideListFilters";
import { formatEuro } from "@/utils/fareCalculator";
import { customerFarePriceRowLabel } from "@/utils/customerFareDisplay";
import { postCustomerRideTip } from "@/utils/stripePaymentApi";
import {
  type CustomerLiveRidePhase,
  customerLivePhaseFromRideStatus,
  isCustomerDriverAssignedStatus,
} from "@/utils/onrodaRideOpsFlow";
import { RideChatModal } from "@/components/ride-chat/RideChatModal";
import { RideChatReplyBanner } from "@/components/ride-chat/RideChatReplyBanner";
import { rs, rf } from "@/utils/scale";
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
  fetchCustomerRideChatMessages,
  sendCustomerRideChatMessage,
} from "@/utils/rideChatApi";
import { formatDriverNavDistanceKm } from "@/utils/ridePickupEta";
import { connectToRide, disconnectSocket, sendCustomerLocation } from "@/utils/socket";
import { getDriverLiveNavigationRideId } from "@/utils/driverLiveNavigation";
import { readCustomerSessionJwtForWsJoin } from "@/utils/wsJoinAuth";
import { fetchCustomerRidePin } from "@/utils/customerRidePinApi";
import { rideRequiresPassengerPinClient } from "@/utils/rideRequiresPassengerPin";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Barzahlung",
  paypal: "PayPal",
  card: "Kreditkarte",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  voucher: "Transportschein",
  app: "App-Zahlung",
  access_code: "Gutschein / Freigabe",
};

/** Quitting: Icon aus Server-Auftrag ableiten (Context kann nach Abschluss leer sein). */
type ReceiptPayIcon = "card" | "paypal" | "app" | "access_code" | "voucher" | "cash";

function receiptPaymentIconKind(req: RideRequest | null, ctxPm: PaymentMethod | null): ReceiptPayIcon {
  if (req?.authorizationSource === "access_code") return "access_code";
  const line = (req?.paymentMethod ?? "").toLowerCase();
  if (line.includes("paypal")) return "paypal";
  if (line.includes("kredit") || line.includes("karte") || line.includes("card")) return "card";
  if (line.includes("app-zahlung") || line.includes("app zahlung")) return "app";
  if (
    line.includes("krankenkasse") ||
    line.includes("transportschein") ||
    line.includes("befreit") ||
    line.includes("eigenanteil")
  ) {
    return "voucher";
  }
  if (ctxPm === "access_code") return "access_code";
  if (ctxPm === "card") return "card";
  if (ctxPm === "paypal") return "paypal";
  if (ctxPm === "app") return "app";
  if (ctxPm === "voucher") return "voucher";
  return "cash";
}

const TIP_OPTIONS = [
  { label: "1 €", amt: 1 },
  { label: "2 €", amt: 2 },
  { label: "5 €", amt: 5 },
];

function StarRating({ stars, size = 22, color = "#F59E0B" }: { stars: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= Math.round(stars) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(stars) ? color : "#D1D5DB"}
        />
      ))}
    </View>
  );
}

function ScallopRow({ backgroundColor }: { backgroundColor: string }) {
  return (
    <View style={[styles.scallopRow, { backgroundColor }]}>
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={i} style={[styles.scallopCircle, { backgroundColor }]} />
      ))}
    </View>
  );
}

const API_BASE = getApiBaseUrl();
const USER_PROFILE_KEY = "@taxi24_user_profile";

async function customerSessionHeadersJson(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return headers;
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    const tok = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    if (tok) headers.Authorization = `Bearer ${tok}`;
  } catch {
    /* ignore */
  }
  return headers;
}

async function readCustomerSessionToken(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    return typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
  } catch {
    return "";
  }
}

/** Fahrer-Suche: eine volle Umdrehung, linear (Netflix-ähnlich). */
const SEARCH_SPIN_DURATION_MS = 1300;
const SEARCH_LOADER_RED = "#DC2626";
const SEARCH_RING_BORDER = 2.5;
const NO_DRIVER_WAIT_MS = 60_000;
/** Storno-Grund für API + Anzeige, wenn die Fahrersuche ohne Annahme endet. */
const NO_DRIVER_CANCEL_REASON = "Kein Fahrer gefunden (Wartezeit abgelaufen)";

function geoFromRideRequest(
  shortLabel: string,
  fullLabel: string | undefined,
  lat?: number,
  lon?: number,
): GeoLocation | null {
  const name = (shortLabel || fullLabel || "").trim();
  if (!name) return null;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) < 1e-5 && Math.abs(lon) < 1e-5) return null;
  return {
    displayName: shortLabel.trim() || name,
    lat,
    lon,
  };
}

const TRACKING_ACCENT = "#EF233C";
const TRACKING_LABEL = "#1C1C1E";
const TRACKING_SECONDARY = "#8E8E93";
const TRACKING_BORDER = "#AEAEB2";
const TRACKING_APPLE_BLUE = "#007AFF";
/** WhatsApp-Grün — Chat-Pill während laufender Fahrt (`in_progress`). */
const TRACKING_CHAT_WHATSAPP = "#25D366";

function statusAppleFont(weight: "regular" | "medium" | "semibold" | "bold"): Pick<TextStyle, "fontFamily" | "fontWeight"> {
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

function trackingPaymentPillText(req: RideRequest): string {
  const block = customerPayerBlockFromRideRequest(req);
  if (block.title === "Zahlung") {
    const pm = formatCustomerPaymentMethodLabel(req.paymentMethod);
    const label = pm === "Bar" ? "Barzahlung" : pm;
    return `Zahlung: ${label}`;
  }
  if (block.title === "Kostenübernahme") {
    const who = req.accessCodeSummary?.label?.trim();
    return who ? `Kostenübernahme: ${who}` : "Kostenübernahme";
  }
  return block.title;
}

function searchPaymentDisplayLabel(req: RideRequest): string {
  const pm = formatCustomerPaymentMethodLabel(req.paymentMethod);
  if (pm === "Bar") return "Barzahlung";
  if (pm === "Kreditkarte") return "Kartenzahlung";
  return pm;
}

function SearchPaymentIcon({ kind, size = 18 }: { kind: ReceiptPayIcon; size?: number }) {
  const iconColor = "#6B7280";
  if (kind === "card") {
    return <Feather name="credit-card" size={size} color={iconColor} />;
  }
  if (kind === "paypal") {
    return <Text style={{ fontSize: size, fontFamily: "Inter_700Bold", color: "#1565C0", lineHeight: size + 2 }}>P</Text>;
  }
  if (kind === "app") {
    return <Feather name="smartphone" size={size} color={iconColor} />;
  }
  if (kind === "access_code") {
    return <MaterialCommunityIcons name="shield-check-outline" size={size} color="#15803D" />;
  }
  if (kind === "voucher") {
    return <MaterialCommunityIcons name="ticket-percent-outline" size={size} color="#2563EB" />;
  }
  return <MaterialCommunityIcons name="cash" size={size} color={iconColor} />;
}

const SEARCH_PANEL_BORDER = "rgba(26, 26, 26, 0.14)";

function SearchMetaChip({
  icon,
  label,
  valuePill,
  iconOnly = false,
}: {
  icon: React.ReactNode;
  label?: string;
  valuePill?: string;
  iconOnly?: boolean;
}) {
  return (
    <View
      style={styles.searchMetaChip}
      accessibilityLabel={iconOnly && valuePill ? `Strecke ${valuePill}` : label}
    >
      <View style={styles.searchMetaChipIcon}>{icon}</View>
      <View style={styles.searchMetaChipMain}>
        {iconOnly && valuePill ? (
          <View style={styles.searchMetaChipMetric}>
            <Text style={styles.searchMetaChipMetricText} numberOfLines={1}>
              {valuePill}
            </Text>
          </View>
        ) : label ? (
          <Text style={styles.searchMetaChipLabel} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        {!iconOnly && valuePill ? (
          <View style={styles.searchMetaChipMetric}>
            <Text style={styles.searchMetaChipMetricText} numberOfLines={1}>
              {valuePill}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function formatReservationPickupInRahmen(st: Date | string | null | undefined): string | null {
  return formatCustomerReservationPickupInRahmen(st);
}

function reservationPickupSubline(
  scheduledAt: Date | string | null | undefined,
  pickupDiffMs: number | null,
): string {
  if (pickupDiffMs !== null && pickupDiffMs <= 0) {
    return "Kein Fahrer gefunden – wird automatisch storniert";
  }
  if (pickupDiffMs !== null && pickupDiffMs > 0 && pickupDiffMs < 60 * 60 * 1000) {
    return `Noch ${Math.ceil(pickupDiffMs / 60000)} Min. bis Abholung`;
  }
  const pickupLabel = formatReservationPickupInRahmen(scheduledAt);
  if (pickupLabel) {
    return `Abholung im Rahmen von ${pickupLabel}`;
  }
  if (pickupDiffMs !== null && pickupDiffMs > 0) {
    return `Abholung in ${Math.floor(pickupDiffMs / 3600000)}h ${Math.ceil((pickupDiffMs % 3600000) / 60000)}min`;
  }
  return "Fahrer sehen den Auftrag im Planer.";
}

function SearchTripMetaRow({
  distanceKm,
  billingRequest,
  pickupInRahmen,
}: {
  distanceKm?: number | null;
  billingRequest: RideRequest | null;
  pickupInRahmen?: string | null;
}) {
  const block = billingRequest ? customerPayerBlockFromRideRequest(billingRequest) : null;
  const simplePayment = block?.title === "Zahlung";
  const iconKind = billingRequest ? receiptPaymentIconKind(billingRequest, null) : "cash";

  if (distanceKm == null && !billingRequest && !pickupInRahmen) return null;

  const pickupRow = pickupInRahmen ? (
    <View style={styles.searchMetaRow}>
      <SearchMetaChip
        icon={<Feather name="calendar" size={16} color="#D97706" />}
        label={`Abholung im Rahmen von ${pickupInRahmen}`}
      />
    </View>
  ) : null;

  if (simplePayment && billingRequest && distanceKm != null) {
    return (
      <>
        {pickupRow}
        <View style={styles.searchMetaRow}>
          <SearchMetaChip
            icon={<Feather name="map" size={16} color="#6B7280" />}
            valuePill={`${Number(distanceKm).toFixed(1)} km`}
            iconOnly
          />
          <SearchMetaChip
            icon={<SearchPaymentIcon kind={iconKind} size={16} />}
            label={searchPaymentDisplayLabel(billingRequest)}
          />
        </View>
      </>
    );
  }

  return (
    <>
      {pickupRow}
      {distanceKm != null ? (
        <View style={styles.searchMetaRow}>
          <SearchMetaChip
            icon={<Feather name="map" size={16} color="#6B7280" />}
            valuePill={`${Number(distanceKm).toFixed(1)} km`}
            iconOnly
          />
        </View>
      ) : null}
      {billingRequest && block ? (
        <View style={styles.searchMetaRow}>
          <SearchMetaChip
            icon={<SearchPaymentIcon kind={iconKind} size={16} />}
            label={simplePayment ? searchPaymentDisplayLabel(billingRequest) : block.title}
            valuePill={simplePayment ? undefined : block.subtitle.slice(0, 28)}
          />
        </View>
      ) : null}
    </>
  );
}

function SearchCancelButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.searchCancelBtn, pressed && { opacity: 0.72 }]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Abbrechen"
    >
      <Feather name="x" size={18} color="#DC2626" />
      <Text style={styles.searchCancelBtnText}>Abbrechen</Text>
    </Pressable>
  );
}

function SearchTripSummary({
  originName,
  destName,
  distanceKm,
  billingRequest,
  pickupInRahmen,
}: {
  originName: string;
  destName: string;
  distanceKm?: number | null;
  billingRequest: RideRequest | null;
  pickupInRahmen?: string | null;
}) {
  return (
    <View style={styles.searchTripSummary}>
      <CustomerRouteStopsPanel
        originName={originName}
        destName={destName}
        destinationBackgroundColor={CUSTOMER_ROUTE_MUTED_BG}
      />
      <SearchTripMetaRow
        distanceKm={distanceKm}
        billingRequest={billingRequest}
        pickupInRahmen={pickupInRahmen}
      />
    </View>
  );
}

function ReservationPendingCard({
  headline,
  subText,
  bottomPad,
  displayOrigin,
  displayDestination,
  routePolyline,
  routeDistanceKm,
  billingRequest,
  pickupInRahmen,
  onCancel,
}: {
  headline: string;
  subText: string;
  bottomPad: number;
  displayOrigin: GeoLocation | null;
  displayDestination: GeoLocation | null;
  routePolyline?: [number, number][] | undefined;
  routeDistanceKm?: number | null;
  billingRequest: RideRequest | null;
  pickupInRahmen?: string | null;
  onCancel: () => void;
}) {
  return (
    <View style={styles.container}>
      <RealMapView
        origin={displayOrigin}
        destination={displayDestination}
        polyline={routePolyline}
        style={styles.map}
      />

      <View style={[styles.searchBottomCard, { paddingBottom: bottomPad + 16 }]}>
        <View style={styles.searchCardInnerBorder}>
          <View style={styles.searchAnimRow}>
            <View style={styles.searchLoaderWrap}>
              <View
                style={[styles.searchLoaderIconCenter, { justifyContent: "center", alignItems: "center" }]}
                pointerEvents="none"
              >
                <MaterialCommunityIcons name="calendar-clock" size={28} color="#D97706" />
              </View>
            </View>
            <View style={styles.searchAnimTextCol}>
              <Text style={styles.searchCardTitle}>{headline}</Text>
              <Text
                style={[
                  styles.searchCardSub,
                  subText.includes("Kein Fahrer gefunden")
                    ? { color: "#DC2626" }
                    : subText.includes("Noch ") && subText.includes("Min.")
                      ? { color: "#D97706" }
                      : subText.includes("Abholung im Rahmen von")
                        ? { color: "#D97706" }
                        : null,
                ]}
              >
                {subText}
              </Text>
            </View>
            <SearchCancelButton onPress={onCancel} />
          </View>

          <View style={styles.searchCardDivider} />

          <SearchTripSummary
            originName={displayOrigin?.displayName ?? "Esslingen am Neckar"}
            destName={displayDestination?.displayName ?? "–"}
            distanceKm={routeDistanceKm}
            billingRequest={billingRequest}
            pickupInRahmen={pickupInRahmen}
          />
        </View>
      </View>
    </View>
  );
}

function splitDestinationLines(displayName: string | undefined): { title: string; sub: string } {
  const raw = (displayName ?? "Ziel").trim();
  if (!raw) return { title: "Ziel", sub: "" };
  const comma = raw.indexOf(",");
  if (comma > 0) {
    return { title: raw.slice(0, comma).trim(), sub: raw.slice(comma + 1).trim() };
  }
  return { title: raw, sub: "" };
}

/** Genau ein aktiver Schritt (0 = unterwegs, 1 = Ankunft, 2 = Fahrt/Ziel). */
function trackingProgressActiveStep(status: RideRequest["status"] | undefined): 0 | 1 | 2 {
  if (status === "completed" || status === "in_progress") return 2;
  if (status === "driver_waiting") return 1;
  return 0;
}

function TrackingProgressStep({
  icon,
  label,
  active,
  iconSet = "feather",
}: {
  icon: React.ComponentProps<typeof Feather>["name"] | React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  active: boolean;
  iconSet?: "feather" | "mci";
}) {
  const color = active ? TRACKING_APPLE_BLUE : TRACKING_SECONDARY;
  const size = rf(15);
  return (
    <View
      style={active ? styles.trackingProgressItemActive : styles.trackingProgressItem}
      pointerEvents="none"
      accessibilityRole="text"
      importantForAccessibility="no-hide-descendants"
    >
      {iconSet === "mci" ? (
        <MaterialCommunityIcons name={icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={size} color={color} />
      ) : (
        <Feather name={icon as React.ComponentProps<typeof Feather>["name"]} size={size} color={color} />
      )}
      <Text
        style={active ? styles.trackingProgressActiveText : styles.trackingProgressText}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

export default function StatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const {
    destination,
    origin,
    route,
    paymentMethod,
    completeRide,
    cancelRide,
    setOrigin,
    setDestination,
  } = useRide();
  const { rideId: rideIdParam } = useLocalSearchParams<{ rideId?: string }>();
  const {
    requests,
    passengerAcceptedRequest: acceptedRequest,
    lastAddedRequestId,
    cancelRequest,
    refreshRequests,
    myActiveRequests,
    isConnected,
    customerRidesHydrated,
  } = useRideRequests();
  const { isLoggedIn: isDriverLoggedIn } = useDriver();

  useEffect(() => {
    if (!isDriverLoggedIn) return;
    router.replace("/driver/dashboard" as "/driver/dashboard");
  }, [isDriverLoggedIn]);

  const scheduledPassengerRide = useMemo(
    () =>
      myActiveRequests.find((r) => r.status === "scheduled" || r.status === "scheduled_assigned") ?? null,
    [myActiveRequests],
  );

  /** Welche Fahrt dieser Screen begleitet (Route-Param hat Vorrang vor Context-Fallback). */
  const currentRideId = useMemo(() => {
    const fromRoute = typeof rideIdParam === "string" ? rideIdParam.trim() : "";
    if (fromRoute.length > 0) return fromRoute;
    if (acceptedRequest?.id) return acceptedRequest.id;
    if (scheduledPassengerRide?.id) return scheduledPassengerRide.id;
    if (lastAddedRequestId) return lastAddedRequestId;
    return null;
  }, [rideIdParam, acceptedRequest?.id, scheduledPassengerRide?.id, lastAddedRequestId]);

  const rideMatchingCurrentId = useMemo(
    () => (currentRideId ? requests.find((r) => r.id === currentRideId) ?? null : null),
    [requests, currentRideId],
  );

  const pendingBillingRequest = useMemo(
    () => myActiveRequests.find((r) => r.id === lastAddedRequestId) ?? null,
    [myActiveRequests, lastAddedRequestId],
  );

  /**
   * Nur Abschluss **dieser** Fahrt — nicht „letzte completed Fahrt des Passagiers“.
   * Sonst: neue aktive Fahrt + alte Quittung → rawPhase „completed“ und sofort Quittung-UI.
   */
  const completedForCurrentRide = useMemo(() => {
    if (!currentRideId) return null;
    return requests.find((r) => r.id === currentRideId && r.status === "completed") ?? null;
  }, [requests, currentRideId]);

  const [isCompleted, setIsCompleted] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [serverEtaMinutes, setServerEtaMinutes] = useState<number | null>(null);
  /** Straßen-Restmeter vom Fahrer-Navi (gleiche Quelle wie Fahrer-Anzeige). */
  const [serverRemainingDistM, setServerRemainingDistM] = useState<number | null>(null);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [customTipInput, setCustomTipInput] = useState("");
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [userRating, setUserRating] = useState(5);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [driverMarker, setDriverMarker] = useState<{ lat: number; lon: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<RideChatMessage[]>([]);
  const [chatPartnerDisplayName, setChatPartnerDisplayName] = useState<string | null>(null);
  const [chatReplyTo, setChatReplyTo] = useState<RideChatReplyTarget | null>(null);
  const [chatUnread, setChatUnread] = useState(false);
  const chatOpenRef = useRef(false);
  const stickyAcceptedRef = useRef<RideRequest | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const cancelFlowStartedRef = useRef(false);
  const currentRideIdRef = useRef<string | null>(null);
  const requestsRef = useRef(requests);
  const cancelRequestRef = useRef(cancelRequest);
  const refreshRequestsRef = useRef(refreshRequests);
  /** Verhindert doppelte Meldung bei wiederholtem Poll nach `expired`/`rejected`. */
  const handledReservationUnfulfilledRef = useRef<string | null>(null);
  /** Verhindert doppelte Meldung nach endgültigem Storno auf dem Live-Screen. */
  const handledRideCancelledRef = useRef<string | null>(null);
  /** Szenario C: Fahrer → searching_driver, Meldung + Such-UI (einmal pro rideId). */
  const handledDriverReassignedRef = useRef<string | null>(null);
  /** War diese rideId schon in Fahrer-/Live-Phase (vor Rückkehr in Suche). */
  const hadDriverPhaseForRideRef = useRef<string | null>(null);
  const [driverReassignedBanner, setDriverReassignedBanner] = useState(false);
  /** Abhol-Code auf Live-Status (Profil ist während Tracking nicht erreichbar). */
  const [liveRidePin, setLiveRidePin] = useState<string | null>(null);
  /** Tracking-Details (Bewertung, km, Fortschritt) — eingeklappt: Name, KZ, ETA. */
  const [trackingDetailsOpen, setTrackingDetailsOpen] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const searchGlowAnim = useRef(new Animated.Value(0.4)).current;
  const prevPhaseRef = useRef<string>("searching");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    currentRideIdRef.current = currentRideId;
    requestsRef.current = requests;
    cancelRequestRef.current = cancelRequest;
    refreshRequestsRef.current = refreshRequests;
  }, [currentRideId, requests, cancelRequest, refreshRequests]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    setChatMsgs([]);
    setChatUnread(false);
    setChatReplyTo(null);
  }, [acceptedRequest?.id]);

  useEffect(() => {
    if (acceptedRequest) stickyAcceptedRef.current = acceptedRequest;
  }, [acceptedRequest]);

  /**
   * Nur die Fahrt mit `currentRideId` — nie eine andere „accepted“-Fahrt aus dem Context,
   * sonst springt die UI während `searching_driver` auf Tracking / „Fahrer da“.
   */
  const effectiveAcceptedRequest = useMemo(() => {
    if (!currentRideId) {
      return acceptedRequest;
    }
    const live = requests.find((r) => r.id === currentRideId) ?? null;
    if (live) {
      if (isCustomerFinalCancelledStatus(live.status)) {
        stickyAcceptedRef.current = null;
        return null;
      }
      if (isCustomerOpenDispatchStatus(live.status)) {
        stickyAcceptedRef.current = null;
        return null;
      }
      if (isCustomerDriverAssignedStatus(live.status)) return live;
      stickyAcceptedRef.current = null;
      return null;
    }
    const sticky = stickyAcceptedRef.current;
    return sticky?.id === currentRideId ? sticky : null;
  }, [acceptedRequest, currentRideId, requests]);

  const rideChatEnabled = effectiveAcceptedRequest?.chatEnabled === true;
  const rideChatCanSend = effectiveAcceptedRequest
    ? isRideChatSendAllowed(effectiveAcceptedRequest.status, effectiveAcceptedRequest.chatEnabled)
    : false;

  const sendCustomerChatMessage = useCallback(async () => {
    const msg = chatInput.trim();
    const ride = effectiveAcceptedRequest;
    if (!msg || !ride?.id) return;
    if (!isRideChatSendAllowed(ride.status, ride.chatEnabled)) return;
    const reply = chatReplyTo ?? undefined;
    const clientMessageId = `cm-${Date.now()}`;
    const pendingId = rideChatMessageId(`pending-${Date.now()}`, "customer", msg);
    setChatMsgs((prev) =>
      mergeRideChatMessages(prev, {
        id: pendingId,
        from: "customer",
        text: msg,
        pending: true,
        ...(reply ? { replyTo: reply } : {}),
      }),
    );
    setChatInput("");
    setChatReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const headers = await customerSessionHeadersJson();
      const result = await sendCustomerRideChatMessage(ride.id, msg, headers, clientMessageId);
      if (result.ok) {
        setChatMsgs((prev) => mergeRideChatMessages(prev, apiMessageToRideChatMessage(result.message)));
      }
    } catch {
      /* pending bleibt bis WS/Reload */
    }
  }, [chatInput, chatReplyTo, effectiveAcceptedRequest]);

  useEffect(() => {
    const rideId = effectiveAcceptedRequest?.id;
    if (!chatOpen || !rideId || !rideChatEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await customerSessionHeadersJson();
        const { items, partnerDisplayName } = await fetchCustomerRideChatMessages(rideId, headers);
        if (!cancelled) {
          if (partnerDisplayName) setChatPartnerDisplayName(partnerDisplayName);
          setChatMsgs((prev) => mergeRideChatMessagesFromApi(prev, rideChatMessagesFromApi(items)));
        }
      } catch {
        /* ignore */
      }
    })();
    const poll = setInterval(() => {
      void (async () => {
        try {
          const headers = await customerSessionHeadersJson();
          const { items, partnerDisplayName } = await fetchCustomerRideChatMessages(rideId, headers);
          if (!cancelled) {
            if (partnerDisplayName) setChatPartnerDisplayName(partnerDisplayName);
            setChatMsgs((prev) => mergeRideChatMessagesFromApi(prev, rideChatMessagesFromApi(items)));
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
  }, [chatOpen, effectiveAcceptedRequest?.id, rideChatEnabled]);

  const assignedDriver = effectiveAcceptedRequest?.assignedDriver ?? null;
  const driverName = assignedDriver?.displayName ?? "Ihr Fahrer";
  const driverFirstName = assignedDriver?.firstName ?? driverName.split(" ")[0] ?? "Fahrer";
  const driverCar = assignedDriver?.vehicleLabel ?? assignedDriver?.vehicleModel ?? "";
  const driverPlate = assignedDriver?.licensePlate ?? effectiveAcceptedRequest?.driverPlate ?? "";
  const driverRating = assignedDriver?.rating ?? null;
  const driverPhone = assignedDriver?.phone?.trim() ?? "";
  const driverInitials = assignedDriver?.initials ?? driverFirstName.slice(0, 2).toUpperCase();

  const completedRideForRating = completedForCurrentRide ?? effectiveAcceptedRequest;

  useEffect(() => {
    const saved = completedRideForRating?.passengerRating;
    if (typeof saved === "number" && saved >= 1 && saved <= 5) {
      setUserRating(saved);
    }
  }, [completedRideForRating?.id, completedRideForRating?.passengerRating]);

  const submitDriverRating = async (stars: number) => {
    const rideId = completedForCurrentRide?.id ?? currentRideId;
    if (!rideId || ratingSubmitting || completedRideForRating?.passengerRating != null) return;
    setUserRating(stars);
    setRatingSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/customer/v1/rides/${encodeURIComponent(rideId)}/driver-rating`, {
        method: "POST",
        headers: { ...(await customerSessionHeadersJson()), "Content-Type": "application/json" },
        body: JSON.stringify({ stars }),
      });
      if (res.ok) void refreshRequests();
    } catch {
      /* ignore */
    } finally {
      setRatingSubmitting(false);
    }
  };

  const serverRideForUi = rideMatchingCurrentId ?? effectiveAcceptedRequest;

  const displayOrigin = useMemo(() => {
    if (origin?.displayName?.trim()) return origin;
    const r = serverRideForUi;
    if (!r) return origin;
    return geoFromRideRequest(r.from, r.fromFull, r.fromLat, r.fromLon) ?? origin;
  }, [origin, serverRideForUi]);

  const displayDestination = useMemo(() => {
    if (destination?.displayName?.trim()) return destination;
    const r = serverRideForUi;
    if (!r) return destination;
    return geoFromRideRequest(r.to, r.toFull, r.toLat, r.toLon) ?? destination;
  }, [destination, serverRideForUi]);

  /** Kein „Suche Fahrer…“-Flash: warten bis Kunden-Fahrten vom Server da sind. */
  const statusBootstrapPending =
    !customerRidesHydrated || (Boolean(currentRideId) && customerRidesHydrated && !rideMatchingCurrentId);

  useEffect(() => {
    const r = rideMatchingCurrentId;
    if (!r) return;
    const o = geoFromRideRequest(r.from, r.fromFull, r.fromLat, r.fromLon);
    const d = geoFromRideRequest(r.to, r.toFull, r.toLat, r.toLon);
    if (o && !origin?.displayName?.trim()) setOrigin(o);
    if (d && !destination?.displayName?.trim()) setDestination(d);
  }, [
    rideMatchingCurrentId?.id,
    rideMatchingCurrentId?.from,
    rideMatchingCurrentId?.to,
    origin?.displayName,
    destination?.displayName,
    setOrigin,
    setDestination,
  ]);

  /**
   * App-Kill → OS stellt oft `/status?rideId=` wieder her, bevor GET /rides fertig ist.
   * Sofortiges `replace("/")` würde die Live-Fahrt verlieren — kurz warten + Refresh.
   * Offline / Fahrt weg (Storno/Ende): nach Grace zur Startseite, kein Dauer-Spinner.
   */
  useEffect(() => {
    if (!customerRidesHydrated || !currentRideId) return;
    if (rideMatchingCurrentId) return;
    let cancelled = false;
    const rideId = currentRideId;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await refreshRequestsRef.current();
        } catch {
          /* offline — trotzdem entscheiden */
        }
        if (cancelled) return;
        const found = requestsRef.current.find((r) => r.id === rideId);
        if (!found) {
          router.replace("/");
          return;
        }
        // Terminal: Status-Screen erkennt cancelled/completed selbst; hier nichts erzwingen.
      })();
    }, 2800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerRidesHydrated, currentRideId, rideMatchingCurrentId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshRequests();
    });
    return () => sub.remove();
  }, [refreshRequests]);

  const reservationScheduledAt =
    rideMatchingCurrentId?.scheduledAt ??
    pendingBillingRequest?.scheduledAt ??
    effectiveAcceptedRequest?.scheduledAt ??
    null;
  const pickupDiffMs =
    reservationScheduledAt != null
      ? new Date(reservationScheduledAt).getTime() - now
      : null;

  const withinPickupHour =
    pickupDiffMs !== null &&
    pickupDiffMs >= 0 &&
    pickupDiffMs <= 60 * 60 * 1000;

  const rawPhase = useMemo(():
    | CustomerLiveRidePhase
    | "ride_cancelled"
    | "completed" => {
    if (completedForCurrentRide) return "completed";

    const cur = rideMatchingCurrentId;
    if (currentRideId && cur?.id === currentRideId) {
      if (isCustomerFinalCancelledStatus(cur.status)) return "ride_cancelled";
      if (isCustomerOpenDispatchStatus(cur.status)) return "searching";
      const st = cur.scheduledAt;
      const hasSched =
        st != null &&
        (st instanceof Date ? Number.isFinite(st.getTime()) : String(st).trim().length > 0);
      if ((cur.status === "expired" || cur.status === "rejected") && hasSched) {
        return "reservation_unfulfilled";
      }
      if (cur.status === "scheduled" || cur.status === "scheduled_assigned") return "reserved";
      const ops = customerLivePhaseFromRideStatus(cur.status, {
        scheduledAt: cur.scheduledAt,
        withinPickupHour,
      });
      if (ops) return ops;
      return "searching";
    }

    const eff = effectiveAcceptedRequest;
    if (eff && (!currentRideId || eff.id === currentRideId)) {
      const ops = customerLivePhaseFromRideStatus(eff.status, {
        scheduledAt: eff.scheduledAt,
        withinPickupHour,
      });
      if (ops) return ops;
    }

    return "searching";
  }, [
    completedForCurrentRide,
    rideMatchingCurrentId,
    currentRideId,
    effectiveAcceptedRequest,
    withinPickupHour,
  ]);

  const customerPhase = isCompleted ? "completed" : rawPhase;

  /** Status-Polling auf Live-Screen — erkennt u. a. Fahrer-Storno (`cancelled_by_driver`). */
  useEffect(() => {
    if (!currentRideId) return;
    if (customerPhase === "completed" || customerPhase === "ride_cancelled") return;
    void refreshRequests();
    const timer = setInterval(() => void refreshRequests(), 3500);
    return () => clearInterval(timer);
  }, [currentRideId, customerPhase, refreshRequests]);

  const customerPhaseRef = useRef(customerPhase);
  const acceptedRequestRef = useRef<RideRequest | null>(effectiveAcceptedRequest);
  customerPhaseRef.current = customerPhase;
  acceptedRequestRef.current = effectiveAcceptedRequest;

  // WebSocket for real-time driver GPS + HTTP fallback
  useEffect(() => {
    if (
      !effectiveAcceptedRequest ||
      rawPhase === "searching" ||
      rawPhase === "reserved" ||
      rawPhase === "reservation_unfulfilled" ||
      rawPhase === "ride_cancelled" ||
      rawPhase === "completed"
    )
      return;
    const rid = effectiveAcceptedRequest.id;
    if (getDriverLiveNavigationRideId() === rid) {
      return;
    }

    connectToRide(
      rid,
      (msg) => {
        if (msg.type === "location:driver:update") {
          setDriverMarker({ lat: msg.lat as number, lon: msg.lon as number });
          const etaFromDriver =
            typeof msg.etaMinutes === "number" && Number.isFinite(msg.etaMinutes)
              ? Math.max(0, Math.round(msg.etaMinutes))
              : null;
          if (etaFromDriver != null) setServerEtaMinutes(etaFromDriver);
          const distFromDriver =
            typeof msg.remainingDistM === "number" && Number.isFinite(msg.remainingDistM)
              ? Math.max(0, Math.round(msg.remainingDistM))
              : null;
          if (distFromDriver != null) setServerRemainingDistM(distFromDriver);
        }
        if (msg.type === "chat:ride:update") {
          const row = parseRideChatUpdate(msg);
          if (!row) return;
          setChatMsgs((prev) => mergeRideChatMessages(prev, row));
          if (row.from !== "customer" && !chatOpenRef.current) setChatUnread(true);
        }
      },
      readCustomerSessionJwtForWsJoin,
    );

    // HTTP fallback polling every 5s
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${rid}/driver-location`, {
          headers: await customerSessionHeadersJson(),
        });
        if (res.ok) {
          const loc = (await res.json()) as {
            lat: number;
            lon: number;
            etaMinutes?: number;
            remainingDistM?: number;
          };
          setDriverMarker({ lat: loc.lat, lon: loc.lon });
          if (typeof loc.etaMinutes === "number" && Number.isFinite(loc.etaMinutes)) {
            setServerEtaMinutes(Math.max(0, Math.round(loc.etaMinutes)));
          }
          if (typeof loc.remainingDistM === "number" && Number.isFinite(loc.remainingDistM)) {
            setServerRemainingDistM(Math.max(0, Math.round(loc.remainingDistM)));
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); disconnectSocket(); };
  }, [effectiveAcceptedRequest?.id, rawPhase]);

  // Send customer GPS to driver every ~4s when ride is active
  useEffect(() => {
    if (
      !effectiveAcceptedRequest ||
      rawPhase === "searching" ||
      rawPhase === "reserved" ||
      rawPhase === "reservation_unfulfilled" ||
      rawPhase === "ride_cancelled" ||
      rawPhase === "completed"
    )
      return;
    const rid = effectiveAcceptedRequest.id;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          sendCustomerLocation(latitude, longitude);
          void (async () => {
            try {
              const headers = await customerSessionHeadersJson();
              await fetch(`${API_BASE}/rides/${rid}/customer-location`, {
                method: "POST",
                headers,
                body: JSON.stringify({ lat: latitude, lon: longitude }),
              });
            } catch {
              /* ignore */
            }
          })();
        }
      );
    })();
    return () => { sub?.remove(); };
  }, [effectiveAcceptedRequest?.id, rawPhase]);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (customerPhase !== "searching") return;
    searchSpinAnim.setValue(0);
    const spin = Animated.loop(
      Animated.timing(searchSpinAnim, {
        toValue: 1,
        duration: SEARCH_SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => {
      spin.stop();
      searchSpinAnim.setValue(0);
    };
  }, [customerPhase]);

  useEffect(() => {
    if (customerPhase !== "searching") return;
    searchGlowAnim.setValue(0.92);
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(searchGlowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(searchGlowAnim, {
          toValue: 0.88,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => {
      glow.stop();
      searchGlowAnim.setValue(1);
    };
  }, [customerPhase]);

  useEffect(() => {
    setServerEtaMinutes(null);
    setServerRemainingDistM(null);
    setEta(null);
  }, [effectiveAcceptedRequest?.id]);

  /** Abhol-Code auf Live-Status laden — Profil/Menü ist während Tracking nicht erreichbar. */
  useEffect(() => {
    const ride = effectiveAcceptedRequest;
    const pinPhases =
      customerPhase === "accepted" ||
      customerPhase === "preparing" ||
      customerPhase === "arrived";
    if (!ride || !pinPhases || !rideRequiresPassengerPinClient(ride)) {
      setLiveRidePin(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await readCustomerSessionToken();
        if (!token || cancelled) return;
        const res = await fetchCustomerRidePin(token);
        if (!cancelled) setLiveRidePin(res.pin);
      } catch {
        if (!cancelled) setLiveRidePin(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveAcceptedRequest?.id, customerPhase, effectiveAcceptedRequest]);

  useEffect(() => {
    if (prevPhaseRef.current !== rawPhase) {
      if (rawPhase === "driving") {
        setServerEtaMinutes(null);
        setServerRemainingDistM(null);
        setEta(null);
      }
      prevPhaseRef.current = rawPhase;
    }
  }, [rawPhase]);

  /** Nur Fahrer-Navi-ETA (Matrix/OSRM) — kein Luftlinien-Fallback (sonst Abweichung zur Fahrer-Sicht). */
  useEffect(() => {
    if (serverEtaMinutes != null) {
      setEta(serverEtaMinutes);
    }
  }, [serverEtaMinutes]);

  const handleCallDriver = () => {
    const tel = driverPhone.replace(/[^\d+]/g, "");
    if (!tel) {
      Alert.alert("Anruf nicht möglich", "Für diese Fahrt ist keine Fahrer-Telefonnummer hinterlegt.");
      return;
    }
    void Linking.openURL(`tel:${tel}`);
  };

  useEffect(() => {
    setIsCompleted(false);
    setDriverReassignedBanner(false);
    setTrackingDetailsOpen(false);
    if (handledDriverReassignedRef.current && handledDriverReassignedRef.current !== currentRideId) {
      handledDriverReassignedRef.current = null;
    }
    if (hadDriverPhaseForRideRef.current && hadDriverPhaseForRideRef.current !== currentRideId) {
      hadDriverPhaseForRideRef.current = null;
    }
  }, [currentRideId]);

  useEffect(() => {
    if (!currentRideId) return;
    if (
      customerPhase === "accepted" ||
      customerPhase === "preparing" ||
      customerPhase === "arrived" ||
      customerPhase === "driving"
    ) {
      hadDriverPhaseForRideRef.current = currentRideId;
    }
  }, [customerPhase, currentRideId]);

  useEffect(() => {
    if (completedForCurrentRide && !isCompleted) {
      const t = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        completeRide({
          serverRideId: completedForCurrentRide.id,
          finalFare: completedForCurrentRide.finalFare ?? null,
          pricingMode: completedForCurrentRide.pricingMode ?? null,
        });
        setIsCompleted(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [completedForCurrentRide, isCompleted, completeRide]);

  const handleCancel = () => {
    if (customerPhase === "searching" || customerPhase === "reserved") {
      void submitCancel(
        customerPhase === "reserved"
          ? "Vorbestellung durch Kunden abgebrochen"
          : "Suche manuell durch Kunden abgebrochen",
      );
      return;
    }
    setCancelModalOpen(true);
  };

  const resolveCancelableRequestId = () => {
    const routeRideId = typeof rideIdParam === "string" && rideIdParam.trim().length > 0 ? rideIdParam.trim() : null;
    if (routeRideId) return routeRideId;

    const active = myActiveRequests.find((r) =>
      r.status === "pending" ||
      r.status === "scheduled" ||
      r.status === "scheduled_assigned" ||
      r.status === "requested" ||
      r.status === "searching_driver" ||
      r.status === "offered" ||
      r.status === "accepted" ||
      r.status === "driver_arriving" ||
      r.status === "driver_waiting" ||
      r.status === "passenger_onboard" ||
      r.status === "arrived" ||
      r.status === "in_progress",
    );
    return active?.id ?? lastAddedRequestId ?? acceptedRequest?.id ?? null;
  };

  const finishCancelLocally = () => {
    if (cancelFlowStartedRef.current) return;
    cancelFlowStartedRef.current = true;
    setCancelModalOpen(false);
    setCancelReason("");
    router.replace("/");
    requestAnimationFrame(() => {
      cancelRide();
    });
  };

  const submitCancel = async (reasonOverride?: string) => {
    // IMPORTANT: Follow Onroda Core Policy
    // docs/onroda-core-policy-taxi-mietwagen-storno.md
    if (cancelSubmitting) return;
    setCancelSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const finalReason = (reasonOverride ?? cancelReason).trim() || "Manueller Abbruch durch Nutzer";
    const cancelId = resolveCancelableRequestId();
    console.log("!!! VERSUCHE STORNO FÜR ID:", cancelId);
    try {
      if (cancelId) {
        await cancelRequest(cancelId, undefined, finalReason);
        await refreshRequests();
      } else {
        console.log("[CancelFlow] No cancel ID resolved; finishing locally");
      }
      finishCancelLocally();
    } catch (e) {
      const code = e instanceof Error ? e.message.trim() : "";
      const custom =
        e instanceof Error && typeof (e as Error & { userMessage?: string }).userMessage === "string"
          ? (e as Error & { userMessage?: string }).userMessage!.trim()
          : "";
      if (code === "reservation_storno_locked") {
        Alert.alert(
          "Storno nicht möglich",
          "Bei Vorbestellungen ist ein Storno nur bis 60 Minuten vor der geplanten Abholzeit möglich. Bitte wenden Sie sich bei Bedarf an die Zentrale.",
        );
      } else if (custom) {
        console.log("Cancel Error (API):", e);
        Alert.alert("Storno nicht möglich", custom);
      } else {
        console.log("Cancel Error (API):", e);
        Alert.alert(
          "Storno fehlgeschlagen",
          "Die Stornierung konnte nicht durchgeführt werden. Bitte erneut versuchen oder die Zentrale kontaktieren.",
        );
      }
    } finally {
      setCancelSubmitting(false);
    }
  };

  /**
   * Keine Fahrerannahme: nach Wartezeit automatisch stornieren (aus aktiven Fahrten raus),
   * Meldung „Kein Fahrer gefunden!“, dann zurück zur Startseite.
   */
  useEffect(() => {
    if (customerPhase !== "searching") return;
    const t = setTimeout(() => {
      if (customerPhaseRef.current !== "searching") return;
      if (acceptedRequestRef.current != null) return;
      if (!isConnected) return;
      if (cancelFlowStartedRef.current) return;
      const id = currentRideIdRef.current;
      const list = requestsRef.current;
      const ride = id ? list.find((r) => r.id === id) : undefined;
      if (!id || !ride) return;
      const stillOpen = new Set<RideRequest["status"]>(["searching_driver", "offered", "requested", "pending"]);
      if (!stillOpen.has(ride.status)) return;
      void (async () => {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await cancelRequestRef.current(id, undefined, NO_DRIVER_CANCEL_REASON);
          await refreshRequestsRef.current();
          finishCancelLocally();
          Alert.alert(
            "Kein Fahrer gefunden!",
            "Es hat sich innerhalb der Wartezeit leider kein Fahrer gemeldet. Die Buchung wurde beendet und erscheint nicht mehr bei Ihren aktiven Fahrten.",
            [{ text: "OK" }],
            { cancelable: false },
          );
        } catch {
          finishCancelLocally();
          Alert.alert(
            "Kein Fahrer gefunden",
            "Die Wartezeit ist abgelaufen, die Buchung konnte aber nicht automatisch beendet werden. Bitte in „Meine Fahrten“ stornieren.",
            [{ text: "OK" }],
          );
        }
      })();
    }, NO_DRIVER_WAIT_MS);
    return () => clearTimeout(t);
  }, [customerPhase]);

  useEffect(() => {
    if (handledReservationUnfulfilledRef.current && handledReservationUnfulfilledRef.current !== currentRideId) {
      handledReservationUnfulfilledRef.current = null;
    }
  }, [currentRideId]);

  /**
   * Reservierung: Server setzt z. B. `expired`, wenn zur Abholzeit kein Fahrer die Fahrt übernommen hat.
   * Kunde informieren, Buchungs-State leeren, zur Startseite.
   */
  useEffect(() => {
    if (customerPhase !== "reservation_unfulfilled") return;
    const id = currentRideId;
    if (!id) return;
    if (handledReservationUnfulfilledRef.current === id) return;
    if (cancelFlowStartedRef.current) return;
    const ride = requests.find((r) => r.id === id);
    if (!ride) return;

    const wasSessionBooking =
      lastAddedRequestId === id || myActiveRequests.some((r) => r.id === id);

    handledReservationUnfulfilledRef.current = id;

    if (!wasSessionBooking) {
      router.replace("/");
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const isExpired = ride.status === "expired";
    finishCancelLocally();
    Alert.alert(
      "Kein Fahrer gefunden!",
      isExpired
        ? "Für Ihre Reservierung hat sich leider kein Fahrer gefunden. Die Buchung ist abgelaufen und wurde beendet."
        : "Ihre Reservierung konnte nicht bedient werden und wurde beendet.",
      [{ text: "OK" }],
      { cancelable: false },
    );
  }, [customerPhase, currentRideId, requests, lastAddedRequestId, myActiveRequests]);

  useEffect(() => {
    if (handledRideCancelledRef.current && handledRideCancelledRef.current !== currentRideId) {
      handledRideCancelledRef.current = null;
    }
    if (handledDriverReassignedRef.current && handledDriverReassignedRef.current !== currentRideId) {
      handledDriverReassignedRef.current = null;
    }
  }, [currentRideId]);

  /**
   * Szenario C: Fahrer hat abgesagt → DB `searching_driver`, Kunde bleibt auf Such-Screen.
   */
  useEffect(() => {
    if (customerPhase !== "searching") return;
    const id = currentRideId;
    if (!id || hadDriverPhaseForRideRef.current !== id) return;
    if (handledDriverReassignedRef.current === id) return;
    const ride = requests.find((r) => r.id === id) ?? rideMatchingCurrentId;
    if (!ride || !isCustomerOpenDispatchStatus(ride.status)) return;
    handledDriverReassignedRef.current = id;
    hadDriverPhaseForRideRef.current = null;
    stickyAcceptedRef.current = null;
    disconnectSocket();
    setDriverMarker(null);
    setDriverReassignedBanner(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Neuer Fahrer gesucht",
      "Fahrer hat abgesagt — wir suchen einen neuen Fahrer",
      [{ text: "OK" }],
      { cancelable: true },
    );
  }, [customerPhase, currentRideId, requests, rideMatchingCurrentId]);

  /**
   * Endgültiges Storno — Live-Navi beenden, zur Startseite (nicht Szenario C / searching_driver).
   */
  useEffect(() => {
    if (customerPhase !== "ride_cancelled") return;
    const id = currentRideId;
    if (!id) return;
    if (handledRideCancelledRef.current === id) return;
    if (cancelFlowStartedRef.current) return;
    const ride = requests.find((r) => r.id === id) ?? rideMatchingCurrentId;
    if (!ride || !isCustomerFinalCancelledStatus(ride.status)) return;
    handledRideCancelledRef.current = id;
    stickyAcceptedRef.current = null;
    disconnectSocket();
    setDriverMarker(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const reason =
      typeof ride.cancelReason === "string" && ride.cancelReason.trim().length > 0
        ? ride.cancelReason.trim()
        : null;
    let title = "Fahrt beendet";
    let message = "Die Fahrt wurde beendet.";
    if (ride.status === "cancelled_by_driver") {
      title = "Fahrt beendet";
      message = reason
        ? `Die Fahrt wurde beendet.\n\nGrund: ${reason}`
        : "Die Fahrt wurde beendet.";
    } else if (ride.status === "cancelled_by_customer") {
      title = "Fahrt storniert";
      message = reason
        ? `Die Fahrt wurde storniert.\n\nGrund: ${reason}`
        : "Die Fahrt wurde storniert.";
    } else if (ride.status === "cancelled_by_system") {
      title = "Fahrt beendet";
      message = reason
        ? `Die Fahrt wurde vom System beendet.\n\nGrund: ${reason}`
        : "Die Fahrt wurde vom System beendet.";
    }
    finishCancelLocally();
    Alert.alert(title, message, [{ text: "OK" }], { cancelable: false });
  }, [customerPhase, currentRideId, requests, rideMatchingCurrentId]);

  useEffect(() => {
    if (
      customerPhase === "searching" ||
      customerPhase === "reserved" ||
      customerPhase === "reservation_unfulfilled" ||
      customerPhase === "ride_cancelled" ||
      customerPhase === "completed"
    )
      return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert(
        "Fahrt aktiv",
        "Bitte die Fahrt nicht über Zurück verlassen. Nutzen Sie bei Bedarf die Storno-Aktion.",
      );
      return true;
    });
    return () => sub.remove();
  }, [customerPhase]);

  const handleMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChatUnread(false);
    setChatOpen(true);
  };

  const handleFertig = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/");
  };

  const rawFinalFare = completedForCurrentRide?.finalFare;
  const driverFinalFare =
    rawFinalFare != null && Number.isFinite(Number(rawFinalFare)) ? Number(rawFinalFare) : null;
  const totalFare = driverFinalFare ?? 0;
  const paidTipAmount =
    completedForCurrentRide?.tipAmount != null && Number.isFinite(Number(completedForCurrentRide.tipAmount))
      ? Number(completedForCurrentRide.tipAmount)
      : 0;
  const tipAmount =
    paidTipAmount > 0
      ? paidTipAmount
      : selectedTip === -1
        ? parseFloat(customTipInput.replace(",", ".")) || 0
        : selectedTip !== null
          ? TIP_OPTIONS[selectedTip].amt
          : 0;
  const grandTotal = totalFare + tipAmount;
  const tipAlreadyPaid = paidTipAmount > 0.005;

  const handleSubmitTip = async () => {
    const ride = completedForCurrentRide;
    if (!ride || tipSubmitting || tipAlreadyPaid || tipAmount < 0.5) return;
    setTipSubmitting(true);
    try {
      const result = await postCustomerRideTip({ rideId: ride.id, amountEur: tipAmount });
      if (!result.ok) {
        const msg =
          result.error === "payment_method_required"
            ? "Für Trinkgeld per App ist eine hinterlegte Karte nötig. Sie können Trinkgeld auch bar im Fahrzeug geben."
            : "Trinkgeld konnte nicht verbucht werden. Bitte erneut versuchen.";
        Alert.alert("Trinkgeld", msg);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshRequests();
    } finally {
      setTipSubmitting(false);
    }
  };

  const hasFutureReservationOutsidePickupHour =
    pickupDiffMs !== null &&
    pickupDiffMs > 60 * 60 * 1000 &&
    rideMatchingCurrentId != null &&
    !isCustomerDriverAssignedStatus(rideMatchingCurrentId.status);

  const searchSpinDegrees = searchSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (isDriverLoggedIn) {
    return (
      <View style={[styles.container, styles.cancelExitWrap]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isCompleted) {
    return (
      <Animated.View style={[styles.completedBg, { opacity: fadeAnim, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.completedScroll}>
          <View style={styles.thankYouSection}>
            <Text style={styles.thankYouTitle}>Vielen Dank{"\n"}für deine Fahrt!</Text>
          </View>

          <View style={styles.receiptWrapper}>
            <View style={[styles.scallopTop, { backgroundColor: "#F3F4F6" }]}>
              <ScallopRow backgroundColor="#F3F4F6" />
            </View>
            <View style={styles.receiptCard}>
              <Text style={styles.receiptTitle}>QUITTUNG</Text>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptRows}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>
                    {customerFarePriceRowLabel(completedForCurrentRide?.pricingMode)}:
                  </Text>
                  <Text style={[styles.receiptValue, driverFinalFare != null ? { color: "#22C55E" } : null]}>
                    {driverFinalFare != null ? formatEuro(driverFinalFare) : "—"}
                  </Text>
                </View>
                {tipAlreadyPaid ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Trinkgeld:</Text>
                    <Text style={[styles.receiptValue, { color: "#2563EB" }]}>{formatEuro(paidTipAmount)}</Text>
                  </View>
                ) : null}
                {tipAlreadyPaid ? (
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptLabel, { fontFamily: "Inter_600SemiBold" }]}>Gesamt:</Text>
                    <Text style={[styles.receiptValue, { color: "#111827", fontFamily: "Inter_700Bold" }]}>
                      {formatEuro(grandTotal)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>
                    {completedForCurrentRide?.actualDistanceKm != null ? "Gefahrene Strecke:" : driverFinalFare != null ? "Geplante Strecke:" : "Distanz:"}
                  </Text>
                  <Text style={styles.receiptValue}>
                    {(completedForCurrentRide?.actualDistanceKm ?? completedForCurrentRide?.distanceKm ?? route?.distanceKm ?? 0).toFixed(1)} km
                  </Text>
                </View>
                {completedForCurrentRide?.actualDurationMinutes != null ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Fahrtdauer:</Text>
                    <Text style={styles.receiptValue}>
                      {completedForCurrentRide.actualDurationMinutes} Min.
                    </Text>
                  </View>
                ) : driverFinalFare != null && driverFinalFare >= 0.005 ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Geschätzte Dauer:</Text>
                    <Text style={styles.receiptValue}>
                      ~{completedForCurrentRide?.durationMinutes ?? route?.durationMinutes ?? 0} Min.
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.receiptDivider} />
              <View style={styles.paymentSection}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.receiptLabel}>
                    {completedForCurrentRide
                      ? customerPayerBlockFromRideRequest(completedForCurrentRide).title
                      : "Zahlung"}
                  </Text>
                  <Text style={styles.paymentMethod}>
                    {completedForCurrentRide
                      ? customerPayerBlockFromRideRequest(completedForCurrentRide).subtitle
                      : paymentMethod
                        ? PAYMENT_LABELS[paymentMethod]
                        : "—"}
                  </Text>
                </View>
                {(() => {
                  const iconKind = receiptPaymentIconKind(completedForCurrentRide, paymentMethod);
                  if (iconKind === "card") {
                    return <Feather name="credit-card" size={24} color="#374151" />;
                  }
                  if (iconKind === "paypal") {
                    return <Text style={styles.paypalIcon}>P</Text>;
                  }
                  if (iconKind === "app") {
                    return <Feather name="smartphone" size={24} color="#374151" />;
                  }
                  if (iconKind === "access_code") {
                    return <MaterialCommunityIcons name="shield-check-outline" size={26} color="#15803D" />;
                  }
                  if (iconKind === "voucher") {
                    return <MaterialCommunityIcons name="ticket-percent-outline" size={26} color="#2563EB" />;
                  }
                  return <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#374151", lineHeight: 24 }}>€</Text>;
                })()}
              </View>
              <View style={styles.receiptDivider} />
              {tipAlreadyPaid ? (
                <Text style={[styles.receiptLabel, { marginBottom: 8, color: "#16A34A" }]}>
                  Trinkgeld verbucht — vielen Dank!
                </Text>
              ) : (
                <>
                  <Text style={[styles.receiptLabel, { marginBottom: 8 }]}>Trinkgeld für {driverFirstName}:</Text>
                  <View style={styles.tipRow}>
                    {TIP_OPTIONS.map((opt, i) => {
                      const isSelected = selectedTip === i;
                      return (
                        <Pressable
                          key={i}
                          style={[styles.tipBtn, isSelected && styles.tipBtnSelected]}
                          onPress={() => {
                            setSelectedTip(isSelected ? null : i);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Text style={[styles.tipBtnLabel, isSelected && styles.tipBtnLabelSelected]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={[styles.tipBtn, selectedTip === -1 && styles.tipBtnSelected]}
                      onPress={() => {
                        setSelectedTip(selectedTip === -1 ? null : -1);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.tipBtnLabel, selectedTip === -1 && styles.tipBtnLabelSelected]}>Eigener</Text>
                    </Pressable>
                  </View>
                  {selectedTip === -1 ? (
                    <TextInput
                      style={styles.customTipInput}
                      placeholder="Betrag in €"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      value={customTipInput}
                      onChangeText={setCustomTipInput}
                      returnKeyType="done"
                    />
                  ) : null}
                  {tipAmount >= 0.5 ? (
                    <Pressable
                      style={[styles.tipSubmitBtn, tipSubmitting && { opacity: 0.7 }]}
                      disabled={tipSubmitting}
                      onPress={() => void handleSubmitTip()}
                    >
                      {tipSubmitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.tipSubmitBtnText}>Trinkgeld geben ({formatEuro(tipAmount)})</Text>
                      )}
                    </Pressable>
                  ) : null}
                </>
              )}
              <View style={styles.receiptDivider} />
              <Pressable style={styles.fertigBtn} onPress={handleFertig}>
                <Text style={styles.fertigBtnText}>Zurück zur Startseite</Text>
              </Pressable>
            </View>
            <View style={[styles.scallopBottom, { backgroundColor: "#F3F4F6" }]}>
              <ScallopRow backgroundColor="#F3F4F6" />
            </View>
          </View>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingQuestion}>Wie war deine Fahrt mit {driverFirstName}?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable
                  key={i}
                  disabled={ratingSubmitting || completedRideForRating?.passengerRating != null}
                  onPress={() => {
                    void submitDriverRating(i);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <MaterialCommunityIcons
                    name={i <= userRating ? "star" : "star-outline"}
                    size={36}
                    color={i <= userRating ? "#F59E0B" : "#D1D5DB"}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.driverNameRating}>{driverName}</Text>
          </View>
        </ScrollView>
      </Animated.View>
    );
  }

  if (statusBootstrapPending) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: rs(24) },
        ]}
      >
        <ActivityIndicator size="large" color="#DC2626" />
        <Text
          style={{
            marginTop: rs(16),
            fontSize: rf(15),
            fontFamily: "Inter_600SemiBold",
            color: colors.foreground,
            textAlign: "center",
          }}
        >
          Fahrt wird geladen…
        </Text>
      </View>
    );
  }

  if (customerPhase === "reservation_unfulfilled") {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: rs(24) },
        ]}
      >
        <ActivityIndicator size="large" color="#DC2626" />
        <Text style={{ marginTop: rs(16), fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center" }}>
          {CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED}
        </Text>
        <Text style={{ marginTop: rs(8), fontSize: rf(13), fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
          Wird beendet…
        </Text>
      </View>
    );
  }

  if (customerPhase === "searching") {
    if (hasFutureReservationOutsidePickupHour) {
      const pickupInRahmen = formatReservationPickupInRahmen(reservationScheduledAt);
      return (
        <ReservationPendingCard
          headline="Reservierung"
          subText={reservationPickupSubline(reservationScheduledAt, pickupDiffMs)}
          bottomPad={bottomPad}
          displayOrigin={displayOrigin}
          displayDestination={displayDestination}
          routePolyline={route?.polyline}
          routeDistanceKm={route?.distanceKm}
          billingRequest={pendingBillingRequest}
          pickupInRahmen={pickupInRahmen}
          onCancel={handleCancel}
        />
      );
    }
    return (
      <View style={styles.container}>
        {/* Karte im Hintergrund */}
        <RealMapView
          origin={displayOrigin}
          destination={displayDestination}
          polyline={route?.polyline}
          style={styles.map}
          driverMarker={driverReassignedBanner ? null : driverMarker}
        />

        {/* Such-Animation + Route-Info unten */}
        <View style={[styles.searchBottomCard, { paddingBottom: bottomPad + 16 }]}>
          <View style={styles.searchCardInnerBorder}>
            {/* Such-Animation: rotierender Ring (linear, GPU) */}
            <View style={styles.searchAnimRow}>
              <View style={styles.searchLoaderWrap}>
                <Animated.View style={{ opacity: searchGlowAnim }} pointerEvents="none">
                  <Animated.View
                    style={[
                      styles.netflixRing,
                      { transform: [{ rotate: searchSpinDegrees }] },
                    ]}
                  />
                </Animated.View>
                <View style={styles.searchLoaderIconCenter} pointerEvents="none">
                  <MaterialCommunityIcons name="taxi" size={22} color={SEARCH_LOADER_RED} />
                </View>
              </View>
              <View style={styles.searchAnimTextCol}>
                <Text style={styles.searchCardTitle}>Suche Fahrer...</Text>
                <Text style={styles.searchCardSub}>
                  {driverReassignedBanner
                    ? "Fahrer hat abgesagt — wir suchen einen neuen Fahrer"
                    : "Deine Anfrage wird bearbeitet"}
                </Text>
              </View>
              <SearchCancelButton onPress={() => handleCancel()} />
            </View>

            <View style={styles.searchCardDivider} />

            <SearchTripSummary
              originName={displayOrigin?.displayName ?? "Esslingen am Neckar"}
              destName={displayDestination?.displayName ?? "–"}
              distanceKm={route?.distanceKm}
              billingRequest={pendingBillingRequest}
            />
          </View>
        </View>
      </View>
    );
  }

  if (customerPhase === "reserved") {
    const pickupInRahmen = formatReservationPickupInRahmen(reservationScheduledAt);
    const rsSt = rideMatchingCurrentId?.status;
    const headline =
      rsSt === "scheduled_assigned"
        ? "Fahrer gefunden"
        : "Reservierung";
    const subText = reservationPickupSubline(reservationScheduledAt, pickupDiffMs);

    return (
      <ReservationPendingCard
        headline={headline}
        subText={subText}
        bottomPad={bottomPad}
        displayOrigin={displayOrigin}
        displayDestination={displayDestination}
        routePolyline={route?.polyline}
        routeDistanceKm={route?.distanceKm}
        billingRequest={pendingBillingRequest}
        pickupInRahmen={pickupInRahmen}
        onCancel={handleCancel}
      />
    );
  }

  if (customerPhase === "ride_cancelled") {
    return (
      <View style={[styles.container, styles.cancelExitWrap]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.cancelExitText}>Fahrt wird beendet…</Text>
      </View>
    );
  }

  const isDriving = customerPhase === "driving";
  const isArrived = customerPhase === "arrived";
  const destLabel =
    displayDestination?.displayName ??
    serverRideForUi?.toFull ??
    serverRideForUi?.to ??
    "Ziel";
  const destLines = splitDestinationLines(destLabel);
  const rideStatus = effectiveAcceptedRequest?.status;
  const progressActive = trackingProgressActiveStep(rideStatus);
  const progressThirdLabel =
    rideStatus === "completed" ? "Ziel erreicht" : rideStatus === "in_progress" ? "Fahrt läuft" : "Ziel erreicht";
  const distanceKm = route?.distanceKm;
  const etaDistanceText =
    serverRemainingDistM != null
      ? formatDriverNavDistanceKm(serverRemainingDistM, { toDestination: isDriving })
      : distanceKm != null && Number.isFinite(Number(distanceKm))
        ? isDriving
          ? `ca. ${Number(distanceKm).toFixed(1).replace(".", ",")} km zum Ziel`
          : `ca. ${Number(distanceKm).toFixed(1).replace(".", ",")} km entfernt`
        : null;

  return (
    <View style={styles.container}>
      <RealMapView
        origin={displayOrigin}
        destination={displayDestination}
        polyline={route?.polyline}
        style={styles.map}
        driverMarker={driverMarker}
        followLiveDriver={Boolean(driverMarker)}
      />

      <View style={[styles.mapOverlayTop, { top: topPad + rs(6) }]}>
        <View style={styles.destinationCard}>
          <Feather name="map-pin" size={rf(18)} color={TRACKING_ACCENT} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.destinationTitle} numberOfLines={1}>
              {destLines.title}
            </Text>
            {destLines.sub ? (
              <Text style={styles.destinationSub} numberOfLines={1}>
                {destLines.sub}
              </Text>
            ) : null}
          </View>
          <View style={styles.targetChipInline} accessibilityLabel="Ziel">
            <Feather name="crosshair" size={rf(14)} color={TRACKING_ACCENT} />
            <Text style={styles.targetChipText}>Ziel</Text>
          </View>
          {liveRidePin ? (
            <View
              style={styles.livePinChip}
              accessibilityRole="text"
              accessibilityLabel={`Abhol-Code ${liveRidePin}`}
            >
              <Text style={styles.livePinChipLabel}>Code</Text>
              <Text style={styles.livePinChipValue}>{liveRidePin}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {isArrived ? (
        <Animated.View
          style={[styles.arrivedBanner, { top: topPad + rs(58) }, { transform: [{ scale: pulseAnim }] }]}
        >
          <MaterialCommunityIcons name="car-emergency" size={rf(18)} color="#fff" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.arrivedBannerTitle}>Ihr Fahrer ist da!</Text>
            <Text style={styles.arrivedBannerSub}>
              {liveRidePin ? `Code dem Fahrer nennen: ${liveRidePin}` : "Bitte zum Fahrzeug kommen"}
            </Text>
          </View>
        </Animated.View>
      ) : isDriving ? (
        <View style={[styles.drivingBanner, { top: topPad + rs(58) }]}>
          <View style={styles.drivingBannerIconCircle}>
            <MaterialCommunityIcons
              name="navigation"
              size={rf(18)}
              color={TRACKING_ACCENT}
              style={styles.drivingBannerNavIcon}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.drivingBannerTitle}>Fahrt gestartet</Text>
            <Text style={styles.drivingBannerSub}>Unterwegs zu Ihrem Ziel</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.trackingBottomSheet, { paddingBottom: bottomPad + rs(6) }]}>
        <View style={styles.sheetHandle} />

        {liveRidePin && !isDriving ? (
          <View
            style={styles.livePinSheetRow}
            accessibilityRole="text"
            accessibilityLabel={`Abhol-Code ${liveRidePin}`}
          >
            <MaterialCommunityIcons name="shield-key-outline" size={rf(20)} color={TRACKING_ACCENT} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.livePinSheetLabel, statusAppleFont("medium")]}>Abhol-Code</Text>
              <Text style={[styles.livePinSheetHint, statusAppleFont("regular")]}>
                Dem Fahrer vor Fahrtstart nennen
              </Text>
            </View>
            <Text style={[styles.livePinSheetValue, statusAppleFont("bold")]}>{liveRidePin}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.trackingDriverRow, pressed && { opacity: 0.92 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTrackingDetailsOpen((o) => !o);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: trackingDetailsOpen }}
          accessibilityLabel={
            trackingDetailsOpen ? "Fahrtdetails einklappen" : "Fahrtdetails ausklappen"
          }
        >
          <View style={styles.trackingDriverInfo}>
            <View style={styles.trackingDriverAvatarWrap}>
              <View style={styles.trackingDriverAvatar}>
                <Text style={styles.trackingDriverAvatarText} allowFontScaling={false}>
                  {driverInitials}
                </Text>
              </View>
              <View
                style={styles.trackingDriverOnlineDot}
                accessibilityLabel="Fahrer online"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.trackingDriverName, statusAppleFont("semibold")]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {driverName}
              </Text>
              <Text style={styles.trackingPlateLine} numberOfLines={1} allowFontScaling={false}>
                {driverPlate || "—"}
              </Text>
              {trackingDetailsOpen && driverRating != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <StarRating stars={driverRating} size={14} />
                  <Text style={styles.trackingDriverRatingText} allowFontScaling={false}>
                    {driverRating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
              {trackingDetailsOpen && driverCar ? (
                <Text style={styles.trackingPlateDetail} numberOfLines={1} allowFontScaling={false}>
                  {driverCar}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.trackingDivider} />

          <View style={styles.trackingEtaBox}>
            {isArrived ? (
              <MaterialCommunityIcons name="map-marker-check" size={rf(28)} color="#22C55E" />
            ) : (
              <>
                <Text
                  style={[styles.trackingEtaLabel, statusAppleFont("medium")]}
                  allowFontScaling={false}
                  numberOfLines={1}
                >
                  {isDriving ? "Ziel in" : "Ankunft in"}
                </Text>
                <View style={styles.trackingEtaValueRow}>
                  <Text style={[styles.trackingEtaNumber, statusAppleFont("bold")]} allowFontScaling={false}>
                    {eta != null ? eta : "—"}
                  </Text>
                  <Text style={[styles.trackingEtaMin, statusAppleFont("bold")]} allowFontScaling={false}>
                    min
                  </Text>
                </View>
                {trackingDetailsOpen && etaDistanceText ? (
                  <Text
                    style={[styles.trackingEtaDistance, statusAppleFont("regular")]}
                    allowFontScaling={false}
                    numberOfLines={2}
                  >
                    {etaDistanceText}
                  </Text>
                ) : null}
              </>
            )}
            {isArrived ? (
              <Text style={styles.trackingEtaDistance} allowFontScaling={false}>
                Am Abholort
              </Text>
            ) : null}
          </View>

          <Feather
            name={trackingDetailsOpen ? "chevron-up" : "chevron-down"}
            size={rf(18)}
            color={TRACKING_SECONDARY}
            style={styles.trackingExpandChevron}
          />
        </Pressable>

        {trackingDetailsOpen ? (
          <View style={styles.trackingProgressCard} pointerEvents="none" accessibilityRole="summary">
            <TrackingProgressStep
              icon="taxi"
              iconSet="mci"
              label="Fahrer unterwegs"
              active={progressActive === 0}
            />
            <Text style={styles.trackingProgressDash}>---</Text>
            <TrackingProgressStep icon="map-pin" label="Ankunft" active={progressActive === 1} />
            <Text style={styles.trackingProgressDash}>---</Text>
            <TrackingProgressStep icon="flag" label={progressThirdLabel} active={progressActive === 2} />
          </View>
        ) : null}

        <View style={styles.trackingActionRow}>
          {effectiveAcceptedRequest ? (
            <View style={[styles.trackingOutlinePill, styles.trackingPaymentPill]}>
              <Text
                style={[styles.trackingPillText, statusAppleFont("regular")]}
                numberOfLines={1}
                allowFontScaling={false}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {trackingPaymentPillText(effectiveAcceptedRequest)}
              </Text>
            </View>
          ) : null}

          {rideChatEnabled ? (
            <Pressable
              style={({ pressed }) => [
                styles.trackingOutlinePill,
                styles.trackingChatPill,
                isDriving && styles.trackingChatPillLive,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityLabel="Chat"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleMessage();
              }}
            >
              <Feather
                name="message-circle"
                size={rf(17)}
                color={isDriving ? TRACKING_CHAT_WHATSAPP : TRACKING_LABEL}
              />
              <Text
                style={[
                  styles.trackingPillText,
                  statusAppleFont("semibold"),
                  isDriving && styles.trackingChatPillLiveText,
                ]}
                allowFontScaling={false}
                numberOfLines={1}
              >
                Chat
              </Text>
              {chatUnread ? (
                <View
                  style={[
                    styles.trackingChatActionBadge,
                    isDriving && styles.trackingChatActionBadgeLive,
                  ]}
                />
              ) : null}
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.trackingOutlinePill,
              styles.trackingCancelPill,
              pressed && { opacity: 0.88 },
            ]}
            onPress={() => handleCancel()}
          >
            <Feather name="x-circle" size={rf(17)} color={TRACKING_ACCENT} />
            <Text
              style={[styles.trackingPillText, styles.trackingCancelPillText, statusAppleFont("semibold")]}
              numberOfLines={1}
              allowFontScaling={false}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Stornieren
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={cancelModalOpen} transparent animationType="fade" onRequestClose={() => setCancelModalOpen(false)}>
        <Pressable style={styles.chatOverlay} onPress={() => setCancelModalOpen(false)}>
          <Pressable style={styles.chatCard} onPress={() => {}}>
            <Text style={styles.chatTitle}>Fahrt stornieren</Text>
            <Text style={styles.chatIncoming}>Bitte Grund angeben. Der Fahrer sieht den Storno-Grund.</Text>
            <TextInput
              style={styles.chatInput}
              placeholder="Storno-Grund eingeben"
              placeholderTextColor="#9CA3AF"
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={{ flexDirection: "row", gap: rs(8) }}>
              <Pressable
                style={[styles.chatSendBtn, { backgroundColor: "#6B7280", flex: 1 }]}
                onPress={() => setCancelModalOpen(false)}
              >
                <Text style={styles.chatSendBtnText}>Zurück</Text>
              </Pressable>
              <Pressable
                style={[styles.chatSendBtn, { backgroundColor: "#DC2626", flex: 1 }]}
                onPress={() => { void submitCancel(); }}
                disabled={cancelSubmitting}
              >
                <Text style={styles.chatSendBtnText}>{cancelSubmitting ? "Storniere..." : "Jetzt stornieren"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <RideChatModal
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        viewerRole="customer"
        partnerDisplayName={chatPartnerDisplayName}
        messages={chatMsgs}
        canSend={Boolean(rideChatCanSend)}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={sendCustomerChatMessage}
        quickReplies={["Ich bin gleich da", "Bitte kurz warten", "Wo sind Sie gerade?"]}
        onQuickReply={(q) => {
          setChatInput(q);
          Haptics.selectionAsync();
        }}
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
              viewerRole="customer"
              onClear={() => setChatReplyTo(null)}
            />
          ) : null
        }
        emptyHint="Noch keine Nachrichten. Vorlage unten antippen oder selbst tippen."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cancelExitWrap: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    gap: rs(16),
  },
  cancelExitText: {
    fontSize: rf(15),
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  map: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  /* Live-Tracking: Ziel oben + helles Bottom-Sheet (kompakt) */
  mapOverlayTop: {
    position: "absolute",
    left: rs(16),
    right: rs(16),
    zIndex: 20,
  },
  destinationCard: {
    minHeight: rs(48),
    borderRadius: rs(18),
    backgroundColor: "#FFFFFF",
    paddingHorizontal: rs(14),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: rs(12),
    shadowOffset: { width: 0, height: rs(4) },
    elevation: 5,
  },
  destinationTitle: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  destinationSub: {
    marginTop: rs(2),
    fontSize: rf(13),
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  livePinChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: rs(12),
    backgroundColor: "#EEF2FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C7D2FE",
  },
  livePinChipLabel: {
    fontSize: rf(10),
    fontFamily: "Inter_600SemiBold",
    color: "#6366F1",
    letterSpacing: 0.3,
  },
  livePinChipValue: {
    marginTop: rs(1),
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: "#312E81",
    letterSpacing: 1.5,
  },
  livePinSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    marginBottom: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    borderRadius: rs(14),
    backgroundColor: "#F8FAFC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  livePinSheetLabel: {
    fontSize: rf(13),
    color: "#111827",
  },
  livePinSheetHint: {
    marginTop: rs(1),
    fontSize: rf(11),
    color: "#6B7280",
  },
  livePinSheetValue: {
    fontSize: rf(22),
    color: "#111827",
    letterSpacing: 2,
  },
  targetChipInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: rs(12),
    backgroundColor: "#FEF2F2",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FECACA",
    flexShrink: 0,
  },
  targetChipText: {
    fontSize: rf(13),
    fontFamily: "Inter_700Bold",
    color: TRACKING_ACCENT,
  },
  trackingBottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: rs(6),
    paddingHorizontal: rs(14),
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: rs(16),
    shadowOffset: { width: 0, height: -rs(4) },
    elevation: 10,
    zIndex: 30,
  },
  sheetHandle: {
    alignSelf: "center",
    width: rs(40),
    height: rs(4),
    borderRadius: 99,
    backgroundColor: "#D1D5DB",
    marginBottom: rs(8),
  },
  trackingDriverRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trackingExpandChevron: {
    marginLeft: rs(2),
    flexShrink: 0,
  },
  trackingEtaBox: {
    width: rs(92),
    maxWidth: "30%",
    flexShrink: 0,
    alignItems: "flex-end",
  },
  trackingEtaLabel: {
    fontSize: rf(12),
    color: TRACKING_SECONDARY,
    letterSpacing: Platform.OS === "ios" ? 0.1 : 0.2,
    textAlign: "right",
  },
  trackingEtaNumber: {
    fontSize: rf(32),
    lineHeight: rf(34),
    color: TRACKING_LABEL,
    letterSpacing: Platform.OS === "ios" ? -0.4 : -0.25,
  },
  trackingEtaValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: rs(2),
    marginTop: rs(2),
  },
  trackingEtaMin: {
    marginBottom: rs(4),
    fontSize: rf(15),
    color: TRACKING_LABEL,
    letterSpacing: Platform.OS === "ios" ? -0.25 : 0,
  },
  trackingEtaDistance: {
    marginTop: rs(2),
    fontSize: rf(10),
    color: TRACKING_SECONDARY,
    lineHeight: rf(13),
    textAlign: "right",
  },
  trackingDivider: {
    width: rs(2),
    height: rs(48),
    borderRadius: rs(1),
    backgroundColor: "#D1D5DB",
    marginHorizontal: rs(4),
    flexShrink: 0,
    alignSelf: "center",
  },
  trackingDriverInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    minWidth: 0,
  },
  trackingAvatar: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  trackingAvatarText: {
    fontSize: rf(18),
    fontFamily: "Inter_700Bold",
    color: "#374151",
  },
  trackingDriverAvatar: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  trackingDriverAvatarWrap: {
    width: rs(44),
    height: rs(44),
    position: "relative",
  },
  trackingDriverOnlineDot: {
    position: "absolute",
    right: rs(0),
    bottom: rs(0),
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: TRACKING_CHAT_WHATSAPP,
    borderWidth: rs(2),
    borderColor: "#FFFFFF",
  },
  trackingDriverAvatarText: {
    fontSize: rf(15),
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  trackingDriverRatingText: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: TRACKING_SECONDARY,
  },
  trackingDriverName: {
    fontSize: rf(16),
    color: TRACKING_LABEL,
    letterSpacing: Platform.OS === "ios" ? -0.4 : -0.25,
  },
  trackingDriverStatus: {
    marginTop: rs(1),
    fontSize: rf(12),
    color: TRACKING_SECONDARY,
  },
  trackingPlateLine: {
    marginTop: rs(2),
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: TRACKING_LABEL,
  },
  trackingPlateDetail: {
    marginTop: rs(2),
    fontSize: rf(11),
    fontFamily: "Inter_500Medium",
    color: TRACKING_SECONDARY,
  },
  trackingEstimate: {
    marginTop: rs(2),
    fontSize: rf(11),
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },
  trackingEstimateSub: {
    marginTop: rs(1),
    fontSize: rf(10),
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  trackingProgressCard: {
    marginTop: rs(6),
    paddingVertical: rs(4),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackingProgressItemActive: {
    alignItems: "center",
    gap: rs(2),
    flex: 1,
  },
  trackingProgressItem: {
    alignItems: "center",
    gap: rs(2),
    flex: 1,
    opacity: 0.72,
  },
  trackingProgressActiveText: {
    fontSize: rf(11),
    fontFamily: "Inter_700Bold",
    color: TRACKING_APPLE_BLUE,
    textAlign: "center",
  },
  trackingProgressText: {
    fontSize: rf(11),
    fontFamily: "Inter_600SemiBold",
    color: TRACKING_SECONDARY,
    textAlign: "center",
  },
  trackingProgressDash: {
    color: "#D1D5DB",
    fontSize: rf(14),
    fontFamily: "Inter_700Bold",
    marginHorizontal: rs(1),
  },
  trackingOutlinePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: rs(5),
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: TRACKING_BORDER,
    backgroundColor: "#FFFFFF",
    position: "relative",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  trackingPaymentPill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: "42%",
  },
  trackingChatPill: {
    flexShrink: 0,
  },
  trackingChatPillLive: {
    borderColor: TRACKING_CHAT_WHATSAPP,
    backgroundColor: "#F0FFF4",
  },
  trackingChatPillLiveText: {
    color: TRACKING_CHAT_WHATSAPP,
  },
  trackingPillText: {
    fontSize: rf(13),
    color: TRACKING_LABEL,
    letterSpacing: Platform.OS === "ios" ? -0.2 : 0,
    flexShrink: 1,
  },
  trackingActionRow: {
    marginTop: rs(10),
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: rs(6),
    alignItems: "center",
    width: "100%",
  },
  trackingChatActionBadge: {
    position: "absolute",
    top: rs(8),
    right: rs(10),
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
    backgroundColor: TRACKING_ACCENT,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  trackingChatActionBadgeLive: {
    backgroundColor: TRACKING_CHAT_WHATSAPP,
  },
  trackingCancelPill: {
    borderColor: TRACKING_ACCENT,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: "36%",
  },
  trackingCancelPillText: {
    color: TRACKING_ACCENT,
  },

  /* Arrived banner */
  arrivedBanner: {
    position: "absolute",
    left: rs(16), right: rs(16),
    backgroundColor: "#16A34A",
    borderRadius: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 10,
  },
  arrivedBannerTitle: {
    fontSize: rf(16), fontFamily: "Inter_700Bold", color: "#fff",
  },
  arrivedBannerSub: {
    fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#BBF7D0", marginTop: 2,
  },
  drivingBanner: {
    position: "absolute",
    left: rs(16),
    right: rs(16),
    backgroundColor: "#4B5563",
    borderRadius: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
  },
  drivingBannerIconCircle: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  /** Navi-Pfeil Richtung ~1 Uhr (ca. 30°). */
  drivingBannerNavIcon: {
    transform: [{ rotate: "30deg" }],
  },
  drivingBannerTitle: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  drivingBannerSub: {
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
    color: "#E5E7EB",
    marginTop: 2,
  },

  logoRow: { flexDirection: "row", alignItems: "center", gap: rs(8), marginBottom: rs(10) },
  logoIconBg: {
    width: rs(32), height: rs(32), borderRadius: rs(8),
    backgroundColor: "#DC2626",
    justifyContent: "center", alignItems: "center",
  },
  logoText: { fontSize: rf(18), fontFamily: "Inter_700Bold", color: "#111", letterSpacing: -0.5 },

  /* Such-Phase: helles Panel, schwarzer Rahmen, schwarze Schrift */
  searchBottomCard: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#FFFFFF",
    paddingTop: rs(16),
    paddingHorizontal: rs(14),
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: "#1A1A1A",
  },
  searchCardInnerBorder: {
    borderWidth: 2.5,
    borderColor: "#0A0A0A",
    borderRadius: rs(18),
    paddingHorizontal: rs(16),
    paddingTop: rs(18),
    paddingBottom: rs(14),
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: rs(8),
    elevation: 6,
  },
  searchAnimRow: { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(14) },
  searchAnimTextCol: { flex: 1, minWidth: 0 },
  searchCancelBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    minWidth: rs(72),
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: rs(10),
    backgroundColor: "#FFFFFF",
    gap: rs(2),
  },
  searchCancelBtnText: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#DC2626",
    textAlign: "center",
  },
  searchLoaderWrap: {
    width: rs(56),
    height: rs(56),
    alignItems: "center",
    justifyContent: "center",
    shadowColor: SEARCH_LOADER_RED,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: rs(10),
    elevation: 8,
  },
  netflixRing: {
    width: rs(50),
    height: rs(50),
    borderRadius: rs(25),
    borderWidth: SEARCH_RING_BORDER,
    borderColor: "transparent",
    borderTopColor: SEARCH_LOADER_RED,
    borderRightColor: SEARCH_LOADER_RED,
  },
  searchLoaderIconCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCardTitle: { fontSize: rf(17), fontFamily: "Inter_700Bold", color: "#111111", marginBottom: rs(3) },
  searchCardSub: { fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#525252" },
  searchCardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#D4D4D4", marginBottom: rs(12) },

  searchTripSummary: { gap: rs(8) },
  searchMetaRow: { flexDirection: "row", alignItems: "stretch", gap: rs(8), marginTop: rs(2) },
  searchMetaChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    minHeight: rs(52),
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    backgroundColor: "#F9FAFB",
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEARCH_PANEL_BORDER,
    minWidth: 0,
  },
  searchMetaChipIcon: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  searchMetaChipMain: { flex: 1, minWidth: 0, justifyContent: "center", minHeight: rs(32) },
  searchMetaChipLabel: {
    fontSize: rf(13),
    lineHeight: rf(18),
    fontFamily: "Inter_600SemiBold",
    color: "#111111",
  },
  searchMetaChipMetric: {
    alignSelf: "flex-start",
    paddingHorizontal: rs(8),
    paddingVertical: rs(5),
    borderRadius: rs(6),
    backgroundColor: "#E5E7EB",
  },
  searchMetaChipMetricText: {
    fontSize: rf(13),
    lineHeight: rf(18),
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  searchPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#D4D4D4",
    marginTop: rs(6),
    paddingTop: rs(12),
    paddingBottom: rs(2),
  },
  searchPriceLabel: { fontSize: rf(14), fontFamily: "Inter_500Medium", color: "#374151" },
  searchPricePill: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(8),
    borderRadius: rs(11),
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.28)",
  },
  searchPriceValue: {
    fontSize: rf(21),
    fontFamily: "Inter_700Bold",
    color: "#111111",
    letterSpacing: -0.3,
  },
  searchPriceSurcharge: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
    marginTop: 2,
  },

  chatOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: rs(18),
  },
  chatCard: {
    backgroundColor: "#fff",
    borderRadius: rs(16),
    padding: rs(16),
    gap: rs(10),
  },
  chatTitle: { fontSize: rf(18), fontFamily: "Inter_700Bold", color: "#111827" },
  chatHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    marginBottom: rs(2),
  },
  chatCloseBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  chatIncoming: { fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#374151" },
  chatThreadBox: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: rs(14),
    backgroundColor: "#F9FAFB",
    padding: rs(12),
    gap: rs(10),
    minHeight: rs(160),
  },
  chatEmptyHint: {
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: rf(19),
  },
  chatBubbleIncoming: {
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: rs(10),
    gap: rs(4),
    marginBottom: rs(8),
  },
  chatBubbleOutgoing: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    backgroundColor: "#DCFCE7",
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: "#86EFAC",
    padding: rs(10),
    gap: rs(4),
    marginBottom: rs(8),
  },
  chatBubbleMeta: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  chatBubbleText: { fontSize: rf(14), fontFamily: "Inter_400Regular", color: "#111827", lineHeight: rf(20) },
  chatReplyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    marginBottom: rs(8),
    padding: rs(10),
    borderRadius: rs(10),
    backgroundColor: "#F3F4F6",
    borderLeftWidth: 3,
    borderLeftColor: "#DC2626",
  },
  chatReplyBannerLabel: { flex: 1, fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#4B5563" },
  chatReplyQuote: {
    fontSize: rf(11),
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginBottom: rs(4),
    paddingLeft: rs(6),
    borderLeftWidth: 2,
    borderLeftColor: "#D1D5DB",
  },
  chatTemplatesLabel: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#9CA3AF", letterSpacing: 0.4 },
  chatTemplatesWrap: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  chatTemplateChip: {
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
  },
  chatTemplateChipText: { fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#374151" },
  chatComposerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: rs(10),
    marginTop: rs(12),
  },
  chatComposerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: rs(22),
    paddingHorizontal: rs(16),
    paddingVertical: rs(10),
    color: "#111827",
    fontSize: rf(15),
    fontFamily: "Inter_400Regular",
    backgroundColor: "#FFFFFF",
    minHeight: rs(44),
    maxHeight: rs(96),
    textAlignVertical: "center",
  },
  chatComposerSendBtn: {
    width: rs(46),
    height: rs(46),
    borderRadius: rs(23),
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#128C7E",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chatComposerSendBtnDisabled: { opacity: 0.42 },
  chatComposerSendIcon: { marginLeft: 2, marginTop: 1 },
  chatInput: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    color: "#111827",
    fontSize: rf(14),
    fontFamily: "Inter_400Regular",
  },
  chatSendBtn: {
    backgroundColor: "#111827",
    borderRadius: rs(10),
    alignItems: "center",
    paddingVertical: rs(10),
  },
  chatSendBtnText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_700Bold" },

  completedBg: { flex: 1, backgroundColor: "#F3F4F6" },
  completedScroll: { paddingHorizontal: rs(20), paddingBottom: rs(40), gap: 0 },
  thankYouSection: { paddingTop: rs(24), paddingBottom: rs(20) },
  thankYouTitle: { fontSize: rf(32), fontFamily: "Inter_700Bold", color: "#111", lineHeight: rf(40) },

  receiptWrapper: { marginHorizontal: 0 },
  scallopTop: { height: rs(18), overflow: "hidden" },
  scallopBottom: { height: rs(18), overflow: "hidden", transform: [{ rotate: "180deg" }] },
  scallopRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", height: rs(18) },
  scallopCircle: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: "#F3F4F6", marginBottom: -11 },

  receiptCard: { backgroundColor: "#fff", paddingHorizontal: rs(24), paddingVertical: rs(20), gap: rs(12) },
  receiptTitle: { fontSize: rf(20), fontFamily: "Inter_700Bold", textAlign: "center", color: "#111", letterSpacing: 2 },
  receiptDivider: { height: 1, backgroundColor: "#E5E7EB", borderStyle: "dashed", marginVertical: 2 },
  receiptRows: { gap: rs(10) },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receiptLabel: { fontSize: rf(14), fontFamily: "Inter_400Regular", color: "#374151" },
  receiptValue: { fontSize: rf(15), fontFamily: "Inter_700Bold", color: "#111" },
  paymentSection: { flexDirection: "row", alignItems: "center", gap: rs(10) },
  paymentMethod: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#111", marginTop: 2 },
  paypalIcon: { fontSize: rf(20), fontFamily: "Inter_700Bold", color: "#1565C0", width: rs(24), textAlign: "center" },

  tipRow: { flexDirection: "row", gap: rs(8) },
  tipBtn: {
    flex: 1, borderRadius: rs(12), borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingVertical: rs(10), alignItems: "center", backgroundColor: "#F9FAFB", gap: rs(2),
  },
  tipBtnSelected: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  tipBtnLabel: { fontSize: rf(14), fontFamily: "Inter_700Bold", color: "#374151" },
  tipBtnLabelSelected: { color: "#DC2626" },
  tipBtnAmount: { fontSize: rf(11), fontFamily: "Inter_400Regular", color: "#6B7280" },
  tipSubmitBtn: {
    marginTop: rs(10),
    backgroundColor: "#2563EB",
    borderRadius: rs(12),
    paddingVertical: rs(12),
    alignItems: "center",
    justifyContent: "center",
    minHeight: rs(44),
  },
  tipSubmitBtnText: { color: "#fff", fontSize: rf(15), fontFamily: "Inter_700Bold" },
  customTipInput: {
    marginTop: rs(10),
    borderWidth: 1.5,
    borderColor: "#DC2626",
    borderRadius: rs(10),
    paddingHorizontal: rs(14),
    paddingVertical: rs(10),
    fontSize: rf(16),
    fontFamily: "Inter_600SemiBold",
    color: "#1F2937",
  },

  fertigBtn: { backgroundColor: "#DC2626", borderRadius: rs(14), paddingVertical: rs(16), alignItems: "center", marginTop: rs(4) },
  fertigBtnText: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", color: "#fff" },

  ratingSection: { alignItems: "center", gap: rs(12), paddingTop: rs(24), paddingBottom: rs(16) },
  ratingQuestion: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", color: "#374151" },
  driverNameRating: { fontSize: rf(15), fontFamily: "Inter_500Medium", color: "#374151", marginTop: rs(4) },
});
