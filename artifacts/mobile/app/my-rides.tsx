import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import {
  CUSTOMER_ROUTE_MUTED_BG,
  CustomerRouteStopsPanel,
  formatCustomerReservationPickupInRahmen,
} from "@/components/booking/CustomerRouteStopsPanel";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRide, type PaymentMethod, type RideHistoryEntry, type VehicleType, VEHICLES } from "@/context/RideContext";
import { type RideRequest, useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { accountSheetPrimaryLabel, accountSheetSecondaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { customerPayerBlockFromRideRequest } from "@/utils/customerBillingCopy";
import { CUSTOMER_TAXAMETER_LABEL, customerFareModeLabel, isRideFixedPrice } from "@/utils/customerFareDisplay";
import { formatEuro } from "@/utils/fareCalculator";
import {
  CUSTOMER_RIDE_STATUS_CANCELLED_BY_SYSTEM,
  CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED,
  customerRideListStatusLabel,
} from "@/utils/customerRideStatusLabel";
import {
  archiveCustomerRide,
  loadCustomerArchivedRideIds,
} from "@/utils/customerArchivedRides";
import {
  isCustomerRideActiveNow,
  isCustomerRideFuture,
  isCustomerStaleOpenDispatch,
} from "@/utils/customerRideListFilters";
import { downloadReceipt } from "@/utils/receipt";
import { rs, rf } from "@/utils/scale";

/** Außenrahmen — leicht abgeschwächtes Schwarz */
const LIST_FRAME_BORDER = "#3F3F46";
/** Sekundärtext: dunkel genug zum schnellen Lesen (nicht helles Grau) */
const LIST_TEXT_STRONG = "#1F2937";

const GMAPS_KEY = "AIzaSyC6-pFE0kCcB-57r2ALZ81SAXys8_PpeoQ";

function buildStaticMapUrl(origin: string, destination: string): string {
  const enc = encodeURIComponent;
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=400x120` +
    `&maptype=roadmap` +
    `&style=feature:poi|visibility:off` +
    `&style=feature:transit|visibility:off` +
    `&markers=color:black|size:small|${enc(origin)}` +
    `&markers=color:red|size:small|${enc(destination)}` +
    `&path=color:0xDC262680|weight:3|${enc(origin)}|${enc(destination)}` +
    `&key=${GMAPS_KEY}`
  );
}

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

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  cash: "pocket",
  paypal: "credit-card",
  card: "credit-card",
  apple_pay: "credit-card",
  google_pay: "credit-card",
  voucher: "shield",
  app: "smartphone",
  access_code: "ticket-confirmation",
};

type FilterTab = "aktuell" | "zukunft" | "abgelaufen";

const ADDRESS_UNKNOWN = "Unbekannt";

function trimAddressInput(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text || text === "—" || text === "-") return "";
  if (text.toLowerCase() === ADDRESS_UNKNOWN.toLowerCase()) return "";
  return text;
}

function normalizeAddressDisplay(raw: string): string {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2 && /^\d{1,5}[a-zA-Z]?$/.test(parts[0]) && /[A-Za-zÄÖÜäöüß]/.test(parts[1])) {
    const number = parts.shift() as string;
    parts[0] = `${parts[0]} ${number}`.trim();
    return parts.join(", ");
  }
  return raw;
}

function isAdminAddressPart(part: string): boolean {
  const s = part.trim().toLowerCase();
  return (
    s.includes("landkreis") ||
    s.includes("region") ||
    s.includes("regierungsbezirk") ||
    s.includes("baden-württemberg") ||
    s.includes("deutschland")
  );
}

function mergeAddressSources(
  primary: string | null | undefined,
  secondary?: string | null | undefined,
): string {
  const p = trimAddressInput(primary);
  const s = trimAddressInput(secondary);
  if (!p && !s) return "";
  if (!p) return s;
  if (!s || p === s) return p;
  if (p.includes(s) || s.includes(p)) return p.length >= s.length ? p : s;

  const pHasPlz = /\b\d{5}\b/.test(p);
  const sHasPlz = /\b\d{5}\b/.test(s);
  if (!pHasPlz && sHasPlz) return `${p}, ${s}`;
  if (pHasPlz && !sHasPlz) return p;

  return pickBestAddressString(p, s);
}

function pickBestAddressString(...sources: string[]): string {
  const uniq = [...new Set(sources.filter(Boolean))];
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return uniq[0];
  const withPlz = uniq.filter((s) => /\b\d{5}\b/.test(s));
  if (withPlz.length === 1) return withPlz[0];
  if (withPlz.length > 1) {
    return withPlz.sort((a, b) => b.length - a.length)[0];
  }
  return uniq.sort((a, b) => b.length - a.length)[0];
}

function looksLikeStreetPart(part: string): boolean {
  return /\b\d{1,5}[a-zA-Z]?\b/.test(part) && !/\b\d{5}\b/.test(part);
}

function splitSingleAddress(full: string): { line1: string; line2: string } {
  const parts = normalizeAddressDisplay(full)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.toLowerCase() !== ADDRESS_UNKNOWN.toLowerCase());

  if (parts.length === 0) return { line1: ADDRESS_UNKNOWN, line2: "" };

  let plz = "";
  let city = "";
  let plzIdx = -1;

  for (let i = 0; i < parts.length; i++) {
    const match = parts[i].match(/\b(\d{5})\b(?:\s*(.*))?$/);
    if (!match) continue;
    plzIdx = i;
    plz = match[1];
    const inlineCity = String(match[2] ?? "").trim();
    if (inlineCity && !isAdminAddressPart(inlineCity)) {
      city = inlineCity;
      break;
    }
    for (let j = i + 1; j < parts.length; j++) {
      const next = parts[j];
      if (isAdminAddressPart(next) || /\b\d{5}\b/.test(next)) continue;
      city = next;
      break;
    }
    break;
  }

  const usable = parts.filter((p) => !isAdminAddressPart(p));
  const beforePlz = plzIdx >= 0 ? parts.slice(0, plzIdx).filter((p) => !isAdminAddressPart(p)) : usable;
  const streetLine = beforePlz.find((p) => looksLikeStreetPart(p));
  const poiOrNameLine = beforePlz.find((p) => !/\b\d{5}\b/.test(p));
  let line1 = streetLine ?? poiOrNameLine ?? "";

  if (!city && plzIdx < 0 && usable.length >= 2) {
    const localityCandidates = usable.filter(
      (p) => p !== line1 && !looksLikeStreetPart(p) && !/\b\d{5}\b/.test(p),
    );
    if (localityCandidates.length > 0) {
      city = localityCandidates[localityCandidates.length - 1];
    }
  }

  if (!line1) {
    line1 = usable.find((p) => looksLikeStreetPart(p) || !/\b\d{5}\b/.test(p)) ?? usable[0];
  }

  if (city && line1.toLowerCase() === city.toLowerCase()) {
    line1 =
      streetLine ??
      beforePlz.find((p) => p.toLowerCase() !== city.toLowerCase()) ??
      usable.find((p) => looksLikeStreetPart(p)) ??
      line1;
  }

  const line2 = [plz, city].filter(Boolean).join(" ").trim();

  return {
    line1: line1 || ADDRESS_UNKNOWN,
    line2,
  };
}

function splitAddressLines(
  primary: string | null | undefined,
  secondary?: string | null | undefined,
): { line1: string; line2: string } {
  const full = mergeAddressSources(primary, secondary);
  if (!full) return { line1: ADDRESS_UNKNOWN, line2: "" };
  return splitSingleAddress(full);
}

function formatRideAddress(full: string | null | undefined, alt?: string | null): { line1: string; line2: string } {
  return splitAddressLines(full, alt);
}

const SEARCHING_SPINNER_MS = 1500;

function SearchingDriverSpinner() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SEARCHING_SPINNER_MS,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={[styles.searchingSpinnerRing, { transform: [{ rotate }] }]}>
      <View style={styles.searchingSpinnerArc} />
    </Animated.View>
  );
}

function StatusBadge({ status, scheduledAt }: { status: string; scheduledAt?: Date | string | null }) {
  const colors = useColors();

  if (status === "scheduled") {
    return (
      <View style={[styles.statusBadge, styles.statusBadgeSearching]}>
        <SearchingDriverSpinner />
        <Text style={[styles.statusText, styles.statusBadgeSearchingText]}>Suche Fahrer</Text>
      </View>
    );
  }

  if (status === "scheduled_assigned") {
    return (
      <View style={[styles.statusBadge, styles.statusBadgeDriverFound]}>
        <Feather name="check-circle" size={12} color="#16A34A" style={styles.statusBadgeIcon} />
        <Text style={[styles.statusText, styles.statusBadgeDriverFoundText]}>Fahrer gefunden</Text>
      </View>
    );
  }

  const specLabel = customerRideListStatusLabel(status, scheduledAt);
  const config = specLabel
    ? {
        label: specLabel,
        bg:
          status === "cancelled_by_system" || status === "expired" || status === "rejected"
            ? "#EF444422"
            : "#16A34A22",
        fg: status === "cancelled_by_system" || status === "expired" || status === "rejected" ? "#EF4444" : "#16A34A",
      }
    : ({
    requested:   { label: "Anfrage erfasst",    bg: "#F59E0B22", fg: "#D97706" },
    searching_driver: { label: "Fahrersuche", bg: "#F59E0B22", fg: "#D97706" },
    offered:     { label: "Angebot läuft",      bg: "#F59E0B22", fg: "#D97706" },
    pending:     { label: "Warte auf Fahrer", bg: "#F59E0B22", fg: "#D97706" },
    ready_for_dispatch: { label: "Fahrer unterwegs", bg: "#16A34A22", fg: "#16A34A" },
    accepted:    { label: "Fahrer unterwegs",     bg: "#16A34A22", fg: "#16A34A" },
    driver_arriving: { label: "Fahrer unterwegs", bg: "#16A34A22", fg: "#16A34A" },
    driver_waiting: { label: "Fahrer wartet", bg: "#16A34A22", fg: "#16A34A" },
    passenger_onboard: { label: "Kunde an Bord", bg: "#2563EB22", fg: "#2563EB" },
    in_progress: { label: "Fahrt läuft",      bg: "#2563EB22", fg: "#2563EB" },
    completed:   { label: "Abgeschlossen",    bg: colors.success + "22", fg: colors.success },
    cancelled_by_customer: { label: "Storniert", bg: "#EF444422", fg: "#EF4444" },
    cancelled_by_driver: { label: "Storniert", bg: "#EF444422", fg: "#EF4444" },
    cancelled_by_system: { label: "Storniert", bg: "#EF444422", fg: "#EF4444" },
    expired: { label: "Storniert", bg: "#EF444422", fg: "#EF4444" },
    cancelled:   { label: "Storniert",        bg: "#EF444422", fg: "#EF4444" },
    rejected:    { label: "Abgelehnt",        bg: "#EF444422", fg: "#EF4444" },
  }[status] ?? { label: status, bg: "#9CA3AF22", fg: "#9CA3AF" });

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      {(status === "pending" || status === "requested" || status === "searching_driver" || status === "offered") && (
        <ActivityIndicator size={10} color={config.fg} style={{ marginRight: 5 }} />
      )}
      <Text style={[styles.statusText, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
}

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: LIST_TEXT_STRONG }]}>{label}</Text>
    </View>
  );
}

type AddressLines = { line1: string; line2: string };

function RideRouteStops({ from, to }: { from: AddressLines; to: AddressLines }) {
  const colors = useColors();
  return (
    <View style={styles.routeStops}>
      <View style={styles.routeStopRow}>
        <View style={styles.routeStopRailCol}>
          <View style={styles.routeDotStart} />
          <View style={[styles.routeRailLine, { backgroundColor: LIST_FRAME_BORDER }]} />
        </View>
        <View style={styles.routeStopContent}>
          <Text style={[styles.routeStopPlace, { color: colors.foreground }]} numberOfLines={2}>
            {from.line1}
          </Text>
          {from.line2 ? (
            <Text style={[styles.routeStopMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
              {from.line2}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.routeStopRow}>
        <View style={styles.routeStopRailCol}>
          <View style={[styles.routeDotEnd, { borderColor: "#DC2626" }]} />
        </View>
        <View style={[styles.routeStopContent, styles.routeStopContentLast]}>
          <Text style={[styles.routeStopPlace, { color: colors.foreground }]} numberOfLines={2}>
            {to.line1}
          </Text>
          {to.line2 ? (
            <Text style={[styles.routeStopMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
              {to.line2}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type RideMetaChip = {
  value: string;
  valueColor?: string;
  onPress?: () => void;
};

function RideMetaStrip({ items }: { items: RideMetaChip[] }) {
  const colors = useColors();
  const visible = items.filter((item) => item.value.trim().length > 0 && item.value !== "—");
  if (visible.length === 0) return null;
  return (
    <View style={[styles.metaStrip, { borderColor: LIST_FRAME_BORDER, backgroundColor: HOME_SHEET_INNER }]}>
      {visible.map((item, i) => {
        const text = (
          <Text
            style={[styles.metaStripText, { color: item.valueColor ?? colors.foreground }]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        );
        return (
          <React.Fragment key={`${item.value}-${i}`}>
            {i > 0 ? (
              <View style={[styles.metaStripDivider, { backgroundColor: LIST_FRAME_BORDER }]} />
            ) : null}
            {item.onPress ? (
              <Pressable onPress={item.onPress} style={styles.metaStripItem}>
                {text}
              </Pressable>
            ) : (
              <View style={styles.metaStripItem}>{text}</View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function vehicleLabelFromType(type: VehicleType): string {
  return VEHICLES.find((v) => v.id === type)?.name ?? "Standard";
}

function guessPaymentMethodFromRide(pm: string | undefined): PaymentMethod {
  const s = (pm ?? "").toLowerCase();
  if (s.includes("paypal")) return "paypal";
  if (s.includes("kredit") || s.includes("karte")) return "card";
  if (s.includes("kranken") || s.includes("transportschein") || s.includes("eigenanteil")) return "voucher";
  if (s.includes("gutschein") || s.includes("freigabe") || s.includes("code")) return "access_code";
  if (s.includes("app")) return "app";
  return "cash";
}

function guessVehicleTypeFromRide(v: string | undefined): VehicleType {
  const s = (v ?? "").toLowerCase();
  if (s.includes("onroda")) return "standard";
  if (s.includes("xl")) return "xl";
  if (s.includes("rollstuhl")) return "wheelchair";
  if (s === "standard" || s === "taxi") return "standard";
  return "standard";
}

function paymentMethodDisplay(pm: string | undefined): string {
  const s = (pm ?? "").toLowerCase();
  if (s.includes("paypal")) return "PayPal";
  if (s.includes("app")) return "App-Zahlung";
  if (s.includes("gutschein") || s.includes("freigabe") || s.includes("code")) return "Gutschein";
  if (s.includes("transportschein") || s.includes("kranken")) return "Transportschein";
  if (s.includes("kredit") || s.includes("karte")) return "Karte";
  return "Bar";
}

function serverCompletedToHistoryEntry(r: RideRequest): RideHistoryEntry {
  const finalN =
    r.finalFare != null && Number.isFinite(Number(r.finalFare)) ? Number(r.finalFare) : null;
  const created =
    r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt as string).toISOString();
  const sched =
    r.scheduledAt != null
      ? (r.scheduledAt instanceof Date ? r.scheduledAt : new Date(r.scheduledAt as string)).toISOString()
      : null;
  return {
    id: r.id,
    destination: r.toFull || r.to,
    origin: r.fromFull || r.from,
    distanceKm: r.distanceKm,
    actualDistanceKm: r.actualDistanceKm ?? null,
    actualDurationMinutes: r.actualDurationMinutes ?? null,
    totalFare: finalN ?? 0,
    estimatedFare: undefined,
    pricingMode:
      r.pricingMode === "fixed_price"
        ? "fixed_price"
        : r.pricingMode === "taxi_tariff"
          ? "taxi_tariff"
          : null,
    vehicleType: guessVehicleTypeFromRide(r.vehicle),
    paymentMethod: guessPaymentMethodFromRide(r.paymentMethod),
    scheduledTime: sched,
    createdAt: created,
    status: "completed",
  };
}

function cancelledByHintText(ride: {
  status: string;
  cancelledBy: "customer" | "driver" | "system";
  scheduledAt: Date | null;
}): string {
  const spec = customerRideListStatusLabel(ride.status, ride.scheduledAt);
  if (spec) return spec;

  const hasSched =
    ride.scheduledAt != null &&
    (ride.scheduledAt instanceof Date
      ? Number.isFinite(ride.scheduledAt.getTime())
      : String(ride.scheduledAt).trim().length > 0);
  const reservationUnfulfilled = hasSched && (ride.status === "expired" || ride.status === "rejected");

  if (ride.cancelledBy === "system" || ride.status === "cancelled_by_system") {
    return CUSTOMER_RIDE_STATUS_CANCELLED_BY_SYSTEM;
  }
  if (reservationUnfulfilled) {
    return CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED;
  }
  if (ride.cancelledBy === "driver") {
    return "Vom Fahrer storniert";
  }
  return "Von dir storniert";
}

/** Notiz bereits serverseitig / in Buchung — für dauerhaften grünen Haken neben „Notiz an Fahrer“. */
function rideHasPersistedDriverNote(req: RideRequest): boolean {
  const fromA11y = (req.accessibilityOptions?.driverNote ?? "").trim();
  if (fromA11y.length > 0) return true;
  const meta = req.partnerBookingMeta as Record<string, unknown> | null | undefined;
  const raw = meta?.customer_driver_note;
  const fromMeta = typeof raw === "string" ? raw.trim() : "";
  return fromMeta.length > 0;
}

function rideDriverNoteDraftText(req: RideRequest): string {
  const fromA11y = (req.accessibilityOptions?.driverNote ?? "").trim();
  if (fromA11y.length > 0) return String(req.accessibilityOptions?.driverNote ?? "").trim();
  const meta = req.partnerBookingMeta as Record<string, unknown> | null | undefined;
  const raw = meta?.customer_driver_note;
  return typeof raw === "string" ? raw.trim() : "";
}

export default function MyRidesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [driverNoteModal, setDriverNoteModal] = useState(false);
  const [driverNoteRideId, setDriverNoteRideId] = useState<string | null>(null);
  const [driverNoteDraft, setDriverNoteDraft] = useState("");
  const [driverNoteSavedVisible, setDriverNoteSavedVisible] = useState(false);
  const driverNoteSaveBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const { history } = useRide();
  const { profile } = useUser();
  const sessionToken = profile.sessionToken?.trim() ?? "";
  const {
    myCancelledRequests,
    cancelRequest,
    requests,
    passengerId,
    updateRequestPaymentMethod,
    updateRequestDriverNote,
  } = useRideRequests();
  const [activeTab, setActiveTab] = useState<FilterTab>("aktuell");
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const passengerKey = passengerId?.trim() ?? "";

  useEffect(() => {
    if (!passengerKey) {
      setArchivedIds(new Set());
      return;
    }
    void loadCustomerArchivedRideIds(passengerKey).then(setArchivedIds);
  }, [passengerKey]);

  const isArchived = useCallback((rideId: string) => archivedIds.has(rideId), [archivedIds]);

  const handleArchiveRide = useCallback(
    (rideId: string) => {
      if (!passengerKey || !rideId.trim()) return;
      Alert.alert(
        "Fahrt archivieren?",
        "Die Fahrt verschwindet aus Ihrer Liste. Quittungen bleiben in der Geldbörse verfügbar.",
        [
          { text: "Abbrechen", style: "cancel" },
          {
            text: "Archivieren",
            style: "destructive",
            onPress: () => {
              void archiveCustomerRide(passengerKey, rideId).then((next) => {
                setArchivedIds(new Set(next));
              });
            },
          },
        ],
      );
    },
    [passengerKey],
  );

  const activeNowRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          isCustomerRideActiveNow(r) &&
          !isArchived(r.id),
      ),
    [requests, passengerId, isArchived],
  );

  const reservationRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          isCustomerRideFuture(r) &&
          !isArchived(r.id),
      ),
    [requests, passengerId, isArchived],
  );

  const serverCompleted = useMemo(() => {
    if (!passengerId) return [] as RideRequest[];
    return requests.filter((r) => r.passengerId === passengerId && r.status === "completed");
  }, [requests, passengerId]);

  /** Lokale History + API: Endpreis aus Server anreichern, reine Server-Fahrten ergänzen. */
  const completed = useMemo(() => {
    const localDone = history.filter((r) => r.status === "completed");
    const byId = new Map<string, RideHistoryEntry>();
    for (const h of localDone) {
      byId.set(h.id, { ...h });
    }
    for (const r of serverCompleted) {
      const finalN =
        r.finalFare != null && Number.isFinite(Number(r.finalFare)) ? Number(r.finalFare) : null;
      const prev = byId.get(r.id);
      if (prev) {
        if (finalN != null) {
          byId.set(r.id, {
            ...prev,
            totalFare: finalN,
            estimatedFare: undefined,
          });
        }
      } else {
        byId.set(r.id, serverCompletedToHistoryEntry(r));
      }
    }
    return [...byId.values()]
      .filter((r) => !isArchived(r.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [history, serverCompleted, isArchived]);
  const staleDispatch = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.passengerId === passengerId &&
          isCustomerStaleOpenDispatch(r) &&
          !isArchived(r.id),
      ),
    [requests, passengerId, isArchived],
  );

  const cancelled = useMemo(() => {
    const localCancelled = history.filter((r) => r.status === "cancelled");
    const allCancelledIds = new Set(localCancelled.map((r) => r.id));
    const serverCancelled = myCancelledRequests.filter((r) => !allCancelledIds.has(r.id));
    return [
      ...localCancelled.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        from: r.origin ?? "Unbekannt",
        to: r.destination,
        status: r.status as string,
        cancelledBy: "customer" as const,
        distanceKm: r.distanceKm,
        scheduledAt: null as Date | null,
      })),
      ...serverCancelled.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        from: r.from,
        to: r.to,
        status: r.status as string,
        cancelledBy:
          r.status === "rejected"
            ? ("driver" as const)
            : r.status === "cancelled_by_system"
              ? ("system" as const)
              : ("customer" as const),
        distanceKm: r.distanceKm,
        scheduledAt: r.scheduledAt ?? null,
      })),
      ...staleDispatch.map((r) => ({
        id: r.id,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        from: r.fromFull || r.from,
        to: r.toFull || r.to,
        status: r.status as string,
        cancelledBy: "system" as const,
        distanceKm: r.distanceKm,
        scheduledAt: r.scheduledAt ?? null,
      })),
    ]
      .filter((r) => !isArchived(r.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [history, myCancelledRequests, staleDispatch, isArchived]);

  const totalKm    = completed.reduce((s, r) => s + r.distanceKm, 0);
  const totalSpent = completed.reduce((s, r) => s + r.totalFare, 0);

  const handleDownloadReceipt = (ride: typeof completed[0]) => {
    void downloadReceipt(ride.id, sessionToken);
  };

  const handleRepeatRide = () => {
    router.push("/");
  };

  const choosePaymentMethod = (req: RideRequest) => {
    Alert.alert("Zahlungsart wählen", "Wie möchten Sie zahlen?", [
      { text: "Bar", onPress: () => void updateRequestPaymentMethod(req.id, "Bar") },
      { text: "App-Zahlung", onPress: () => void updateRequestPaymentMethod(req.id, "App") },
      { text: "PayPal", onPress: () => void updateRequestPaymentMethod(req.id, "PayPal") },
      { text: "Transportschein", onPress: () => void updateRequestPaymentMethod(req.id, "Transportschein") },
      { text: "Gutschein", onPress: () => void updateRequestPaymentMethod(req.id, "Gutschein / Freigabe (Code)") },
      { text: "Abbrechen", style: "cancel" },
    ]);
  };
  /** `id` = Server-Ride-ID (wie in RideRequest / History) — Support-API und Admin-Tickets hängen daran. */
  const openRideDetail = (id: string, opts?: { focusSupport?: boolean }) => {
    if (!id) return;
    const q = opts?.focusSupport ? `&focus=support` : "";
    router.push(`/ride-detail?id=${encodeURIComponent(id)}${q}` as any);
  };

  React.useEffect(() => {
    return () => {
      if (driverNoteSaveBannerTimerRef.current) clearTimeout(driverNoteSaveBannerTimerRef.current);
    };
  }, []);

  const pastCount = completed.length + cancelled.length;

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: "aktuell", label: "Aktuell", count: activeNowRequests.length || undefined },
    { id: "zukunft", label: "Offene", count: reservationRequests.length || undefined },
    { id: "abgelaufen", label: "Abgelaufen", count: pastCount > 0 ? pastCount : undefined },
  ];

  const showActiveNow = activeTab === "aktuell";
  const showReservations = activeTab === "zukunft";
  const showPast = activeTab === "abgelaufen";
  const isEmpty =
    (showActiveNow && activeNowRequests.length === 0) ||
    (showReservations && reservationRequests.length === 0) ||
    (showPast && completed.length === 0 && cancelled.length === 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header — wie `wallet.tsx` / Profil „Mein Konto“ */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Meine Fahrten</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) }]}
      >
        {driverNoteSavedVisible ? (
          <View style={styles.noteSavedBanner}>
            <Feather name="check-circle" size={rs(18)} color="#16A34A" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.noteSavedBannerTitle}>Notiz gespeichert</Text>
              <Text style={styles.noteSavedBannerSub}>Der Fahrer sieht die aktualisierte Notiz bei dieser Fahrt.</Text>
            </View>
          </View>
        ) : null}
        {/* ── Filter Tabs (direkt unter Kopfzeile wie Abstand Geldbörse → erster Inhalt) ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const zukunftBadge = tab.id === "zukunft";
            const aktuellBadge = tab.id === "aktuell";
            const activeBorderColor = zukunftBadge ? "#16A34A" : aktuellBadge ? "#2563EB" : "#DC2626";
            const badgeColor = tab.id === "abgelaufen" ? "#6B7280" : zukunftBadge ? "#16A34A" : "#2563EB";
            return (
              <Pressable
                key={tab.id}
                style={[
                  styles.tab,
                  {
                    backgroundColor: HOME_SHEET_PANEL,
                    borderColor: isActive ? activeBorderColor : HOME_SHEET_RIM,
                    borderWidth: isActive ? 1 : StyleSheet.hairlineWidth,
                  },
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: isActive
                        ? aktuellBadge
                          ? "#2563EB"
                          : zukunftBadge
                            ? "#16A34A"
                            : "#000000"
                        : "#000000",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.count !== undefined && (
                  <View style={[styles.tabBadge, { backgroundColor: badgeColor }]}>
                    <Text style={[styles.tabBadgeText, { color: "#FFFFFF" }]}>{tab.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Aktuelle Fahrten (Live / Fahrersuche) ── */}
        {showActiveNow && activeNowRequests.length > 0 && (
          <>
            {activeNowRequests.map((req) => {
              const fromAddr = formatRideAddress(req.fromFull, req.from);
              const toAddr = formatRideAddress(req.toFull, req.to);
              const when = new Date(req.createdAt as Date);
              const timeStr = when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const liveStatuses = new Set([
                "pending",
                "requested",
                "searching_driver",
                "offered",
                "accepted",
                "ready_for_dispatch",
                "driver_arriving",
                "driver_waiting",
                "passenger_onboard",
                "arrived",
                "in_progress",
              ]);
              return (
                <View key={req.id} style={[styles.activeCard, { backgroundColor: "#EFF6FF", borderColor: "#2563EB44" }]}>
                  <View style={styles.rideHeader}>
                    <StatusBadge status={req.status} scheduledAt={req.scheduledAt} />
                    <Text style={[styles.rideDate, { color: colors.mutedForeground }]}>{timeStr} Uhr</Text>
                  </View>
                  <RideRouteStops from={fromAddr} to={toAddr} />
                  <RideMetaStrip
                    items={[
                      { value: `${req.distanceKm.toFixed(1)} km` },
                      { value: req.vehicle },
                      {
                        value: isRideFixedPrice(req.pricingMode)
                          ? `${formatEuro(req.estimatedFare)} · ${customerFareModeLabel(req.pricingMode)}`
                          : CUSTOMER_TAXAMETER_LABEL,
                        valueColor: "#2563EB",
                      },
                    ]}
                  />
                  {liveStatuses.has(req.status) ? (
                    <Pressable
                      style={[styles.liveMapRow, { borderColor: LIST_FRAME_BORDER, backgroundColor: HOME_SHEET_PANEL }]}
                      onPress={() => router.push("/status")}
                    >
                      <Feather name="map" size={16} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: colors.foreground, flex: 1 }]}>Live-Karte & Status</Text>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        {/* ── Geplante Reservierungen (Zukunft) ── */}
        {showReservations && reservationRequests.length > 0 && (
          <>
            {reservationRequests.map((req) => {
              const pickupWhen = formatCustomerReservationPickupInRahmen(req.scheduledAt);
              const originName = (req.fromFull ?? req.from ?? "–").trim() || "–";
              const destName = (req.toFull ?? req.to ?? "–").trim() || "–";
              return (
                <View key={req.id} style={[styles.activeCard, { backgroundColor: "#FFFFFF", borderColor: LIST_FRAME_BORDER }]}>
                  <View style={styles.rideHeader}>
                    <StatusBadge status={req.status} scheduledAt={req.scheduledAt} />
                    <View style={styles.reservationPickupMetaWrap}>
                      <Text style={styles.reservationPickupMeta}>Abholung</Text>
                      <Text style={styles.reservationPickupMeta} numberOfLines={2}>
                        {pickupWhen ?? "–"}
                      </Text>
                    </View>
                  </View>
                  <CustomerRouteStopsPanel
                    originName={originName}
                    destName={destName}
                    destinationBackgroundColor={CUSTOMER_ROUTE_MUTED_BG}
                  />
                  <RideMetaStrip
                    items={[
                      { value: `${req.distanceKm.toFixed(1)} km` },
                      { value: req.vehicle },
                      {
                        value: paymentMethodDisplay(req.paymentMethod),
                        onPress: () => choosePaymentMethod(req),
                      },
                      {
                        value: isRideFixedPrice(req.pricingMode)
                          ? `${formatEuro(req.estimatedFare)} · ${customerFareModeLabel(req.pricingMode)}`
                          : CUSTOMER_TAXAMETER_LABEL,
                        valueColor: "#2563EB",
                      },
                    ]}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[
                        styles.rideSupportRowCompact,
                        { borderColor: LIST_FRAME_BORDER, flex: 1, justifyContent: "flex-start" },
                      ]}
                      onPress={() => {
                        setDriverNoteRideId(req.id);
                        setDriverNoteDraft(rideDriverNoteDraftText(req));
                        setDriverNoteModal(true);
                      }}
                    >
                      <Feather name="message-square" size={15} color={colors.foreground} />
                      <Text style={[styles.actionBtnText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                        Notiz an Fahrer
                      </Text>
                      {rideHasPersistedDriverNote(req) ? (
                        <Feather name="check-circle" size={16} color="#16A34A" accessibilityLabel="Notiz gespeichert" />
                      ) : null}
                    </Pressable>
                    <Pressable
                      style={[styles.pdfBtn, { flex: 1 }]}
                      onPress={() =>
                        Alert.alert("Fahrt stornieren?", "Möchtest du diese Reservierung wirklich stornieren?", [
                          { text: "Nein", style: "cancel" },
                          {
                            text: "Ja, stornieren",
                            style: "destructive",
                            onPress: () => {
                              void cancelRequest(req.id, undefined, "Storno durch Kundenansicht (Meine Fahrten)").catch(
                                (e: unknown) => {
                                  const custom =
                                    e instanceof Error &&
                                    typeof (e as Error & { userMessage?: string }).userMessage === "string"
                                      ? (e as Error & { userMessage?: string }).userMessage!.trim()
                                      : "";
                                  Alert.alert(
                                    "Storno nicht möglich",
                                    custom ||
                                      "Die Stornierung konnte nicht durchgeführt werden. Bitte erneut versuchen.",
                                  );
                                },
                              );
                            },
                          },
                        ])
                      }
                    >
                      <Feather name="trash-2" size={15} color="#FFFFFF" />
                      <Text style={styles.pdfBtnText}>Stornieren</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── Abgelaufene Fahrten (abgeschlossen + storniert) ── */}
        {showPast && completed.length > 0 && (
          <>
            {completed.map((ride) => {
              const date    = new Date(ride.createdAt);
              const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const originName = (ride.origin ?? "–").trim() || "–";
              const destName = (ride.destination ?? "–").trim() || "–";
              const whenLabel = `${dateStr} · ${timeStr} Uhr`;
              return (
                <Pressable
                  key={ride.id}
                  style={[styles.rideCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}
                  onPress={() => openRideDetail(ride.id)}
                >


                  <View style={[styles.rideHeader, { marginTop: 12 }]}>
                    <StatusBadge status="completed" />
                    <View style={styles.pastRideWhenFrame}>
                      <Text style={styles.pastRideWhenText} numberOfLines={2}>
                        {whenLabel}
                      </Text>
                    </View>
                  </View>

                  <CustomerRouteStopsPanel
                    originName={originName}
                    destName={destName}
                    destinationBackgroundColor={CUSTOMER_ROUTE_MUTED_BG}
                  />

                  <RideMetaStrip
                    items={[
                      {
                        value:
                          ride.estimatedFare != null && Math.abs(ride.totalFare) < 0.005
                            ? "Geplant: " + `${ride.distanceKm.toFixed(1)} km`
                            : ride.actualDistanceKm != null
                            ? `${ride.actualDistanceKm.toFixed(1)} km`
                            : `${ride.distanceKm.toFixed(1)} km`,
                      },
                      {
                        value:
                          ride.estimatedFare != null && Math.abs(ride.totalFare) < 0.005
                            ? "Keine Fahrt"
                            : ride.actualDurationMinutes != null
                            ? `${ride.actualDurationMinutes} Min.`
                            : "",
                      },
                      { value: vehicleLabelFromType(ride.vehicleType) },
                      { value: PAYMENT_LABELS[ride.paymentMethod] },
                      {
                        value:
                          Math.abs(ride.totalFare) >= 0.005
                            ? `${formatEuro(ride.totalFare)} · ${customerFareModeLabel(ride.pricingMode)}`
                            : "—",
                      },
                    ]}
                  />

                  <View style={styles.pastRideActionsRow}>
                    <Pressable
                      style={[styles.pastRideActionBtn, styles.pastRideQuittungBtn, { flex: 1 }]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        handleDownloadReceipt(ride);
                      }}
                    >
                      <Feather name="file-text" size={14} color="#fff" />
                      <Text style={styles.pastRideQuittungBtnText}>Quittung</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.pastRideActionBtn, styles.pastRideHelpBtn, { flex: 1 }]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        openRideDetail(ride.id, { focusSupport: true });
                      }}
                    >
                      <Feather name="help-circle" size={14} color={colors.primary} />
                      <Text style={styles.pastRideHelpBtnText}>Hilfe</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.pastRideActionBtn, styles.pastRideArchiveBtn]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        handleArchiveRide(ride.id);
                      }}
                    >
                      <Feather name="archive" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {showPast && cancelled.length > 0 && (
          <>
            {cancelled.map((ride) => {
              const date = new Date(ride.createdAt);
              const dateStr = date.toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });
              const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const originName = (ride.from ?? "–").trim() || "–";
              const destName = (ride.to ?? "–").trim() || "–";
              const whenLabel = `${dateStr} · ${timeStr} Uhr`;
              const cancelledHint = cancelledByHintText(ride);
              return (
                <View
                  key={ride.id}
                  style={[styles.cancelledRideCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}
                >
                  <View style={styles.cancelledRideHeader}>
                    <View style={styles.pastRideWhenFrame}>
                      <Text style={styles.pastRideWhenText} numberOfLines={2}>
                        {whenLabel}
                      </Text>
                    </View>
                  </View>
                  <CustomerRouteStopsPanel
                    originName={originName}
                    destName={destName}
                    destinationBackgroundColor={CUSTOMER_ROUTE_MUTED_BG}
                  />
                  <View style={styles.cancelledByHintRow}>
                    <Feather name="info" size={rs(14)} color="#DC2626" />
                    <Text style={styles.cancelledByHint} numberOfLines={2}>
                      {cancelledHint}
                    </Text>
                  </View>
                  <View style={styles.pastRideActionsRow}>
                    <Pressable
                      style={[styles.pastRideActionBtn, styles.pastRideArchiveBtn, styles.pastRideArchiveBtnWide]}
                      onPress={() => handleArchiveRide(ride.id)}
                    >
                      <Feather name="archive" size={14} color={colors.mutedForeground} />
                      <Text style={styles.pastRideHelpBtnText}>Archivieren</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── Leer-Zustand ── */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="navigation" size={36} color="#DC2626" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === "aktuell"
                ? "Keine laufende Fahrt"
                : activeTab === "zukunft"
                  ? "Keine geplanten Fahrten"
                  : "Noch keine abgelaufenen Fahrten"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === "aktuell"
                ? "Sofort-Taxi und laufende Fahrten erscheinen hier. Geplante Termine unter „Offene“."
                : activeTab === "zukunft"
                  ? "Vorbestellungen mit Datum und Uhrzeit findest du hier."
                  : "Abgeschlossene und stornierte Fahrten werden hier gesammelt."}
            </Text>
            {(activeTab === "zukunft" || activeTab === "aktuell") && (
              <Pressable style={styles.newBookingBtn} onPress={() => router.replace("/booking-center")}>
                <Feather name="plus" size={18} color="#fff" />
                <Text style={styles.newBookingBtnText}>Neue Buchung</Text>
              </Pressable>
            )}
          </View>
        )}

      </ScrollView>

      <Modal visible={driverNoteModal} transparent animationType="fade" onRequestClose={() => setDriverNoteModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.noteModalBackdrop}
          keyboardVerticalOffset={topPad + 8}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDriverNoteModal(false)}
            accessibilityRole="button"
            accessibilityLabel="Dialog schließen"
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.noteModalScrollContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.noteModalCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}>
              <View style={styles.noteModalTitleRow}>
                <Text style={[styles.noteModalTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
                {driverNoteDraft.trim().length > 0 ? (
                  <Feather name="check-circle" size={20} color="#16A34A" accessibilityLabel="Notiz vorhanden" />
                ) : null}
              </View>
              <Text style={[styles.noteModalSub, { color: LIST_TEXT_STRONG }]}>
                Diese Notiz sieht der Fahrer bei der Reservierung.
              </Text>
              <TextInput
                value={driverNoteDraft}
                onChangeText={setDriverNoteDraft}
                placeholder="z. B. Bitte am Haupteingang warten"
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={500}
                style={[styles.noteModalInput, { color: colors.foreground, borderColor: LIST_FRAME_BORDER }]}
              />
              <View style={styles.noteModalActions}>
                <Pressable
                  style={[styles.noteModalBtn, { borderColor: LIST_FRAME_BORDER }]}
                  onPress={() => setDriverNoteModal(false)}
                >
                  <Text style={[styles.noteModalBtnText, { color: colors.foreground }]}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  style={[styles.noteModalBtn, styles.noteModalBtnPrimary]}
                  onPress={() => {
                    if (!driverNoteRideId) return;
                    void updateRequestDriverNote(driverNoteRideId, driverNoteDraft)
                      .then(() => {
                        if (Platform.OS !== "web") {
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        setDriverNoteSavedVisible(true);
                        if (driverNoteSaveBannerTimerRef.current) clearTimeout(driverNoteSaveBannerTimerRef.current);
                        driverNoteSaveBannerTimerRef.current = setTimeout(() => {
                          setDriverNoteSavedVisible(false);
                          driverNoteSaveBannerTimerRef.current = null;
                        }, 3200);
                        setDriverNoteModal(false);
                        setDriverNoteRideId(null);
                      })
                      .catch(() => {
                        Alert.alert("Notiz nicht gespeichert", "Bitte versuche es erneut.");
                      });
                  }}
                >
                  <Text style={[styles.noteModalBtnText, { color: "#FFFFFF" }]}>Speichern</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {!driverNoteModal ? (
        <BottomTabBar active="fahrten" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:         { width: rs(36), height: rs(36), justifyContent: "center" },
  headerTitle:     { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  scroll:          { paddingHorizontal: rs(16), paddingTop: rs(20), gap: rs(12) },

  noteSavedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    backgroundColor: "#ECFDF5",
    borderColor: "#86EFAC",
  },
  noteSavedBannerTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold", color: "#166534" },
  noteSavedBannerSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", lineHeight: rf(17), marginTop: rs(2), color: "#15803D" },

  statsRow:        { flexDirection: "row", gap: rs(10) },
  statCard:        { flex: 1, borderRadius: rs(14), borderWidth: 2, padding: rs(12), alignItems: "center", gap: rs(6) },
  statIcon:        { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: "center", justifyContent: "center" },
  statValue:       { fontSize: rf(16), fontFamily: "Inter_700Bold" },
  statLabel:       { fontSize: rf(11), fontFamily: "Inter_600SemiBold" },

  tabsRow:         { flexDirection: "row", gap: rs(8), paddingBottom: rs(12), paddingTop: rs(4), alignItems: "center" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(5),
    minHeight: rs(32),
    paddingHorizontal: rs(9),
    paddingVertical: rs(5),
    borderRadius: rs(15),
  },
  tabText:         { fontSize: rf(13), lineHeight: rf(17), fontFamily: "Inter_500Medium" },
  tabBadge: {
    minWidth: rs(19),
    height: rs(19),
    borderRadius: rs(10),
    paddingHorizontal: rs(5),
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText:    { fontSize: rf(10), fontFamily: "Inter_700Bold", lineHeight: rf(13) },

  archiveBtn: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  archiveRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    marginTop: rs(10),
    alignSelf: "flex-start",
    paddingVertical: rs(6),
    paddingHorizontal: rs(4),
  },
  archiveRowBtnText: { fontSize: rf(13), fontFamily: "Inter_500Medium" },

  completedDropdownRow: {
    flexDirection: "row",
    gap: rs(6),
    marginBottom: 0,
  },
  completedDropdownPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: rs(4),
    paddingHorizontal: rs(8),
    paddingVertical: rs(5),
    minHeight: rs(30),
    borderRadius: rs(999),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  completedDropdownText: {
    flex: 1,
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheetModern: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: rs(22),
    borderTopRightRadius: rs(22),
    paddingTop: rs(8),
    paddingHorizontal: rs(16),
    maxHeight: "52%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  pickerHandle: {
    alignSelf: "center",
    width: rs(40),
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: "#D1D5DB",
    marginBottom: rs(12),
  },
  pickerSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    marginBottom: rs(14),
  },
  pickerSheetTitle: {
    fontSize: rf(17),
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  pickerSheetSub: {
    fontSize: rf(12),
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: rs(2),
  },
  pickerCloseBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(8),
    paddingBottom: rs(4),
  },
  pickerChip: {
    minWidth: "30%",
    flexGrow: 1,
    flexBasis: "30%",
    paddingVertical: rs(12),
    paddingHorizontal: rs(8),
    borderRadius: rs(14),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerChipWide: {
    flexBasis: "100%",
    minWidth: "100%",
  },
  pickerChipActive: {
    backgroundColor: "#EF1D26",
    shadowColor: "#EF1D26",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  pickerChipText: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  pickerChipTextActive: {
    color: "#FFFFFF",
  },
  monthFilterEmpty: {
    ...accountSheetSecondaryLabel,
    textAlign: "center",
    paddingVertical: rs(24),
  },

  activeCard:      { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  rideCard:        { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  rideHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge:     { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(8) },
  statusBadgeSearching: { backgroundColor: "#FEF3C7" },
  statusBadgeSearchingText: { color: "#D97706" },
  statusBadgeDriverFound: { backgroundColor: "#DCFCE7" },
  statusBadgeDriverFoundText: { color: "#16A34A" },
  statusBadgeIcon: { marginRight: rs(5) },
  searchingSpinnerRing: {
    width: rs(11),
    height: rs(11),
    marginRight: rs(7),
    alignItems: "center",
    justifyContent: "center",
  },
  searchingSpinnerArc: {
    width: rs(9),
    height: rs(9),
    borderRadius: rs(5),
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    borderTopColor: "#D97706",
    borderRightColor: "#D97706",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  statusText:      { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  rideDate:        accountSheetSecondaryLabel,

  routeStops: { gap: 0 },
  routeStopRow: { flexDirection: "row", gap: rs(12) },
  routeStopRailCol: { width: rs(18), alignItems: "center" },
  routeDotStart: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
    backgroundColor: "#111827",
    marginTop: rs(3),
  },
  routeDotEnd: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
    borderWidth: 2,
    backgroundColor: "transparent",
    marginTop: rs(3),
  },
  routeRailLine: { width: 2, flex: 1, minHeight: rs(24), marginVertical: rs(4) },
  routeStopContent: { flex: 1, gap: rs(2), paddingBottom: rs(12) },
  routeStopContentLast: { paddingBottom: 0 },
  routeStopPlace: accountSheetPrimaryLabel,
  routeStopMeta: accountSheetSecondaryLabel,

  metaStrip: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(8),
    paddingVertical: rs(7),
    gap: 0,
  },
  metaStripItem: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: rs(3),
    paddingVertical: rs(2),
    alignItems: "center",
    justifyContent: "center",
  },
  metaStripText: {
    ...accountSheetPrimaryLabel,
    fontSize: rf(12),
    lineHeight: rf(16),
    textAlign: "center",
  },
  metaStripDivider: {
    width: 1,
    height: rs(12),
    opacity: 0.55,
    flexShrink: 0,
  },

  cancelledRideCard: {
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
    gap: rs(10),
    marginBottom: rs(4),
  },
  cancelledRideHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  pastRideWhenFrame: {
    alignItems: "flex-end",
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    borderRadius: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#111111",
    maxWidth: "72%",
  },
  pastRideWhenText: {
    fontSize: rf(13),
    lineHeight: rf(18),
    fontFamily: "Inter_400Regular",
    color: "#111111",
    textAlign: "right",
  },
  cancelledWhenText: accountSheetSecondaryLabel,
  cancelledByHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(6),
    marginTop: rs(4),
  },
  cancelledByHint: {
    flex: 1,
    ...accountSheetSecondaryLabel,
    color: "#DC2626",
  },
  rideAddressSub: accountSheetSecondaryLabel,
  reservationPickupMetaWrap: {
    alignItems: "flex-end",
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    borderRadius: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#111111",
    maxWidth: "62%",
  },
  reservationPickupMeta: {
    fontSize: rf(13),
    lineHeight: rf(18),
    fontFamily: "Inter_400Regular",
    color: "#111111",
    textAlign: "right",
  },

  payerLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    borderRadius: rs(9),
    borderWidth: 1,
  },
  payerLineTitle: {
    ...accountSheetSecondaryLabel,
    fontSize: rf(11),
    fontFamily: "Inter_500Medium",
  },
  payerLineSub: {
    ...accountSheetPrimaryLabel,
    marginTop: rs(2),
  },

  driverHint:      { flexDirection: "row", alignItems: "center", gap: rs(8), padding: rs(10), borderRadius: rs(10), borderWidth: 1 },
  driverHintText:  { fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  liveMapRow:      { flexDirection: "row", alignItems: "center", gap: rs(10), paddingVertical: rs(12), paddingHorizontal: rs(12), borderRadius: rs(12), borderWidth: 1, marginTop: rs(2) },
  liveMapText:     { flex: 1, fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  rideSupportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    paddingVertical: rs(12),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    marginTop: rs(2),
  },
  rideSupportRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(5),
    paddingVertical: rs(8),
    paddingHorizontal: rs(6),
    borderRadius: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
  },
  pastRideActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    marginTop: rs(10),
  },
  pastRideActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(5),
    height: rs(32),
    paddingHorizontal: rs(8),
    borderRadius: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#111111",
  },
  pastRideQuittungBtn: {
    backgroundColor: "#DC2626",
  },
  pastRideQuittungBtnText: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  pastRideHelpBtn: {
    backgroundColor: "#F9FAFB",
  },
  pastRideHelpBtnText: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#111111",
  },
  pastRideArchiveBtn: {
    width: rs(40),
    flexShrink: 0,
    backgroundColor: "#F9FAFB",
  },
  pastRideArchiveBtnWide: {
    width: undefined,
    flex: 1,
    alignSelf: "stretch",
  },
  rideSupportText: { flex: 1, fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  actionRow:       { flexDirection: "row", gap: rs(6), marginTop: rs(0) },
  receiptBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(7), paddingVertical: rs(11), borderRadius: rs(10), borderWidth: 2 },
  repeatBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(7), paddingVertical: rs(11), borderRadius: rs(10), borderWidth: 2, borderColor: "#DC262633" },
  actionBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(7), paddingVertical: rs(11), borderRadius: rs(10), borderWidth: 1 },
  staticMap: {
    width: "100%",
    height: rs(120),
    borderRadius: rs(10),
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginBottom: rs(4),
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(8),
    borderRadius: rs(8),
    backgroundColor: "#DC2626",
  },
  pdfBtnText: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  actionBtnText:   { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  noteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: rs(20),
  },
  noteModalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    width: "100%",
  },
  noteModalCard: {
    width: "100%",
    borderRadius: rs(18),
    borderWidth: 1,
    padding: rs(16),
  },
  noteModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    flexWrap: "wrap",
  },
  noteModalTitle: { fontSize: rf(18), fontFamily: "Inter_700Bold" },
  noteModalSub: { fontSize: rf(13), fontFamily: "Inter_500Medium", marginTop: rs(6), lineHeight: rf(18) },
  noteModalInput: {
    minHeight: rs(110),
    borderWidth: 1,
    borderRadius: rs(12),
    padding: rs(12),
    marginTop: rs(14),
    fontSize: rf(15),
    fontFamily: "Inter_500Medium",
    textAlignVertical: "top",
  },
  noteModalActions: { flexDirection: "row", gap: rs(10), marginTop: rs(14) },
  noteModalBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: rs(12),
    paddingVertical: rs(12),
  },
  noteModalBtnPrimary: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  noteModalBtnText: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  emptyState:      { alignItems: "center", gap: rs(12), paddingTop: rs(70) },
  emptyIcon:       { width: rs(80), height: rs(80), borderRadius: rs(24), backgroundColor: "#DC262612", alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle:      { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },
  emptyText:       { fontSize: rf(14), fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: rs(32), lineHeight: rf(20) },
  newBookingBtn:   { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: "#DC2626", borderRadius: rs(14), paddingHorizontal: rs(24), paddingVertical: rs(14), marginTop: rs(8) },
  newBookingBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
});
