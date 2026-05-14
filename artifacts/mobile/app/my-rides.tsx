import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { customerPayerBlockFromRideRequest } from "@/utils/customerBillingCopy";
import { formatEuro } from "@/utils/fareCalculator";
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
  voucher: "Transportschein",
  app: "App-Zahlung",
  access_code: "Gutschein / Freigabe",
};

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  cash: "pocket",
  paypal: "credit-card",
  card: "credit-card",
  voucher: "shield",
  app: "smartphone",
  access_code: "ticket-confirmation",
};

type FilterTab = "alle" | "aktiv" | "reservierungen" | "abgeschlossen" | "storniert";

function normalizeAddressDisplay(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text) return "Unbekannt";
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2 && /^\d{1,5}[a-zA-Z]?$/.test(parts[0]) && /[A-Za-zÄÖÜäöüß]/.test(parts[1])) {
    const number = parts.shift() as string;
    parts[0] = `${parts[0]} ${number}`.trim();
    return parts.join(", ");
  }
  return text;
}

function splitAddressLines(
  primary: string | null | undefined,
  secondary?: string | null | undefined,
): { line1: string; line2: string } {
  const isAdminPart = (part: string): boolean => {
    const s = part.trim().toLowerCase();
    return (
      s.includes("landkreis") ||
      s.includes("region") ||
      s.includes("regierungsbezirk") ||
      s.includes("baden-württemberg") ||
      s.includes("deutschland")
    );
  };
  const isPoiLikePart = (part: string): boolean => {
    const s = part.trim().toLowerCase();
    return (
      s.startsWith("gvv ") ||
      s.includes(" gvv ") ||
      s.includes("bahnhof") ||
      s.includes("flughafen") ||
      s.includes("terminal") ||
      s.includes("haltestelle") ||
      s.includes("station") ||
      s.includes("zentrum")
    );
  };
  const dedupeOverlappingLocalities = (items: string[]): string[] => {
    const cleaned = items
      .map((x) => x.trim())
      .filter(Boolean);
    return cleaned.filter((candidate, idx) => {
      const low = candidate.toLowerCase();
      return !cleaned.some((other, j) => {
        if (j === idx) return false;
        const otherLow = other.toLowerCase();
        return otherLow.length > low.length && otherLow.includes(low);
      });
    });
  };
  const candidates = [primary, secondary]
    .map((v) => normalizeAddressDisplay(v))
    .filter((v) => v.length > 0);
  const merged = candidates.join(", ");
  const parts = merged
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let plz = "";
  let city = "";
  const postalIdx = parts.findIndex((p) => /\b\d{5}\b/.test(p));
  if (postalIdx >= 0) {
    const postalRaw = parts[postalIdx];
    const plzMatch = postalRaw.match(/\b(\d{5})\b\s*,?\s*(.*)$/);
    plz = plzMatch?.[1]?.trim() ?? "";
    const citySameSegment = String(plzMatch?.[2] ?? "").trim();

    if (citySameSegment && !isPoiLikePart(citySameSegment) && !isAdminPart(citySameSegment)) {
      city = citySameSegment;
    } else {
      const after = (parts[postalIdx + 1] ?? "").trim();
      if (after && !isAdminPart(after) && !/\d/.test(after)) {
        city = isPoiLikePart(after) ? "" : after;
      } else {
        const localityCandidates = parts
          .slice(0, postalIdx)
          .filter((p) => !isAdminPart(p) && !/\d/.test(p) && !isPoiLikePart(p));
        city = dedupeOverlappingLocalities(localityCandidates).slice(-2).join(", ").trim();
      }
    }
  } else {
    const localityCandidates = parts.filter(
      (p) => !isAdminPart(p) && !/\d/.test(p) && !isPoiLikePart(p),
    );
    city = dedupeOverlappingLocalities(localityCandidates).slice(-2).join(", ").trim();
  }

  const postalCity = plz && city ? `${plz} ${city}` : city || plz;
  const streetWithNumber = parts.find(
    (p) =>
      /\b\d{1,5}[a-zA-Z]?\b/.test(p) &&
      !/\b\d{5}\b/.test(p) &&
      !isAdminPart(p) &&
      !isPoiLikePart(p),
  );
  const firstStreetish = parts.find((p) => !isAdminPart(p) && !isPoiLikePart(p) && !/\b\d{5}\b/.test(p));
  if (parts.length === 0) return { line1: "Unbekannt", line2: "" };
  return {
    line1: streetWithNumber ?? firstStreetish ?? parts[0],
    line2: postalCity,
  };
}

function formatRideAddress(full: string | null | undefined, label?: string | null): { line1: string; line2: string } {
  return splitAddressLines(full, label);
}

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const config = {
    scheduled:   { label: "Reserviert", bg: "#16A34A22", fg: "#16A34A" },
    scheduled_assigned: { label: "Reserviert", bg: "#16A34A22", fg: "#16A34A" },
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
  }[status] ?? { label: status, bg: "#9CA3AF22", fg: "#9CA3AF" };

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
  const est = Number(r.estimatedFare ?? 0);
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
    totalFare: finalN ?? est,
    estimatedFare:
      finalN != null && est > 0 && Math.abs(est - finalN) > 0.005 ? est : undefined,
    vehicleType: guessVehicleTypeFromRide(r.vehicle),
    paymentMethod: guessPaymentMethodFromRide(r.paymentMethod),
    scheduledTime: sched,
    createdAt: created,
    status: "completed",
  };
}

function dateGroupLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rideDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - rideDay.getTime()) / 86400000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return "Diese Woche";
  if (diffDays < 30) return "Diesen Monat";
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export default function MyRidesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [driverNoteModal, setDriverNoteModal] = useState(false);
  const [driverNoteRideId, setDriverNoteRideId] = useState<string | null>(null);
  const [driverNoteDraft, setDriverNoteDraft] = useState("");
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const { history } = useRide();
  const {
    myActiveRequests,
    myCancelledRequests,
    cancelRequest,
    requests,
    passengerId,
    updateRequestPaymentMethod,
    updateRequestDriverNote,
  } = useRideRequests();
  const [activeTab, setActiveTab] = useState<FilterTab>("alle");
  const reservationRequests = useMemo(
    () => myActiveRequests.filter((r) => r.status === "scheduled" || r.status === "scheduled_assigned"),
    [myActiveRequests],
  );
  const nonReservationActiveRequests = useMemo(
    () => myActiveRequests.filter((r) => r.status !== "scheduled" && r.status !== "scheduled_assigned"),
    [myActiveRequests],
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
      const est = Number(r.estimatedFare ?? 0);
      const prev = byId.get(r.id);
      if (prev) {
        if (finalN != null) {
          byId.set(r.id, {
            ...prev,
            totalFare: finalN,
            estimatedFare:
              est > 0 && Math.abs(est - finalN) > 0.005 ? est : prev.estimatedFare,
          });
        }
      } else {
        byId.set(r.id, serverCompletedToHistoryEntry(r));
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [history, serverCompleted]);
  const localCancelled = history.filter((r) => r.status === "cancelled");

  /* Alle stornierten Fahrten: lokal gespeicherte + vom Server (vom Kunden oder Fahrer storniert) */
  const allCancelledIds = new Set(localCancelled.map((r) => r.id));
  const serverCancelled = myCancelledRequests.filter((r) => !allCancelledIds.has(r.id));
  const cancelled = [...localCancelled.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    from: r.origin ?? "Unbekannt",
    to: r.destination,
    status: r.status as string,
    cancelledBy: "customer" as const,
    distanceKm: r.distanceKm,
  })), ...serverCancelled.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    from: r.from,
    to: r.to,
    status: r.status as string,
    cancelledBy: r.status === "rejected" ? "driver" as const : "customer" as const,
    distanceKm: r.distanceKm,
  }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalKm    = completed.reduce((s, r) => s + r.distanceKm, 0);
  const totalSpent = completed.reduce((s, r) => s + r.totalFare, 0);

  const handleDownloadReceipt = (ride: typeof completed[0]) => {
    const date = new Date(ride.createdAt);
    const vehicle = VEHICLES.find((v) => v.id === ride.vehicleType);
    downloadReceipt({
      rideId:          ride.id.slice(0, 8).toUpperCase(),
      date:            date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time:            date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      origin:          ride.origin ?? "Esslingen am Neckar",
      destination:     ride.destination,
      distanceKm:      ride.distanceKm,
      durationMinutes: Math.round(ride.distanceKm * 3),
      vehicle:         vehicle?.name ?? "Standard",
      paymentMethod:   PAYMENT_LABELS[ride.paymentMethod ?? "cash"],
      totalFare:       ride.totalFare,
    });
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

  const groupedCompleted = useMemo(() => {
    const groups: { label: string; rides: typeof completed }[] = [];
    const seen: Record<string, number> = {};
    completed.forEach((ride) => {
      const label = dateGroupLabel(new Date(ride.createdAt));
      if (seen[label] === undefined) {
        seen[label] = groups.length;
        groups.push({ label, rides: [] });
      }
      groups[seen[label]].rides.push(ride);
    });
    return groups;
  }, [completed]);

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: "alle",          label: "Alle" },
    { id: "aktiv",         label: "Aktiv",         count: nonReservationActiveRequests.length || undefined },
    { id: "reservierungen", label: "Reservierungen", count: reservationRequests.length || undefined },
    { id: "abgeschlossen", label: "Abgeschlossen",  count: completed.length || undefined },
    { id: "storniert",     label: "Storniert",      count: cancelled.length || undefined },
  ];

  const showActive    = activeTab === "alle" || activeTab === "aktiv" || activeTab === "reservierungen";
  const showCompleted = activeTab === "alle" || activeTab === "abgeschlossen";
  const showCancelled = activeTab === "storniert";
  const activeRequestsToRender =
    activeTab === "reservierungen"
      ? reservationRequests
      : activeTab === "aktiv"
        ? nonReservationActiveRequests
        : myActiveRequests;
  const isEmpty       =
    (showActive    && activeRequestsToRender.length === 0) &&
    (showCompleted && completed.length === 0) &&
    (!showCancelled || cancelled.length === 0);

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
        {/* ── Filter Tabs (direkt unter Kopfzeile wie Abstand Geldbörse → erster Inhalt) ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const storniertBadge = tab.id === "storniert";
            const reservierungenBadge = tab.id === "reservierungen";
            const activeBorderColor = reservierungenBadge ? "#16A34A" : "#DC2626";
            const badgeColor = storniertBadge ? "#EF4444" : reservierungenBadge ? "#16A34A" : "#000000";
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
                <Text style={[styles.tabText, { color: isActive && reservierungenBadge ? "#16A34A" : "#000000" }]}>
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

        {/* ── Stats ── */}
        {completed.length > 0 && (
          <View style={styles.statsRow}>
            <StatCard icon="navigation" value={String(completed.length)} label="Fahrten"  color="#2563EB" />
            <StatCard icon="map"        value={totalKm.toFixed(0) + " km"} label="Gesamt"  color="#D97706" />
            <StatCard icon="credit-card" value={formatEuro(totalSpent)} label="Ausgaben" color="#16A34A" />
          </View>
        )}

        {/* ── Aktive Aufträge ── */}
        {showActive && activeRequestsToRender.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#2563EB" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {activeTab === "reservierungen" ? "Reservierungen" : "Aktive Aufträge"}
              </Text>
            </View>

            {activeRequestsToRender.map((req) => {
              const fromAddr = formatRideAddress(req.fromFull, req.from);
              const toAddr = formatRideAddress(req.toFull, req.to);
              const hasPickup = req.scheduledAt != null;
              const isReservation = req.status === "scheduled" || req.status === "scheduled_assigned";
              const when = hasPickup ? new Date(req.scheduledAt as Date) : new Date(req.createdAt);
              const dateStr = when.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const whenLabel = hasPickup ? `${dateStr} · ${timeStr} Uhr` : `${timeStr} Uhr · gebucht`;
              return (
                <View key={req.id} style={[styles.activeCard, { backgroundColor: "#FFFFFF", borderColor: LIST_FRAME_BORDER }]}>
                  <View style={styles.rideHeader}>
                    <StatusBadge status={req.status} />
                    <View style={{ alignItems: "flex-end" }}>
                      {hasPickup && (
                        <Text style={[styles.footerText, { color: LIST_TEXT_STRONG, marginBottom: 2 }]}>Abholung</Text>
                      )}
                      <Text style={[styles.rideDate, { color: LIST_TEXT_STRONG }]} numberOfLines={2}>
                        {whenLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.routeRow}>
                    <View style={styles.routeDots}>
                      <View style={[styles.dotFilled, { backgroundColor: "#111" }]} />
                      <View style={[styles.routeLine, { backgroundColor: LIST_FRAME_BORDER }]} />
                      <View style={[styles.dotOutline, { borderColor: "#DC2626" }]} />
                    </View>
                    <View style={styles.routeLabels}>
                      <View>
                        <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                          {fromAddr.line1}
                        </Text>
                        {fromAddr.line2 ? (
                          <Text style={[styles.footerText, { color: LIST_TEXT_STRONG, marginTop: 2 }]} numberOfLines={1}>
                            {fromAddr.line2}
                          </Text>
                        ) : null}
                      </View>
                      <View>
                        <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                          {toAddr.line1}
                        </Text>
                        {toAddr.line2 ? (
                          <Text style={[styles.footerText, { color: LIST_TEXT_STRONG, marginTop: 2 }]} numberOfLines={1}>
                            {toAddr.line2}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={[styles.rideFooter, { borderTopColor: LIST_FRAME_BORDER }]}>
                    <View style={[styles.compactInfoBlock, { borderColor: LIST_FRAME_BORDER }]}>
                      <View style={styles.footerItem}>
                        <Feather name="map" size={13} color={LIST_TEXT_STRONG} />
                        <Text style={[styles.footerText, { color: LIST_TEXT_STRONG }]}>{req.distanceKm.toFixed(1)} km</Text>
                      </View>
                      <View style={[styles.compactInfoDivider, { backgroundColor: LIST_FRAME_BORDER }]} />
                      <View style={styles.footerItem}>
                        <Text style={[styles.footerText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{req.vehicle}</Text>
                      </View>
                      <View style={[styles.compactInfoDivider, { backgroundColor: LIST_FRAME_BORDER }]} />
                      {isReservation ? (
                        <Pressable onPress={() => choosePaymentMethod(req)} style={styles.footerItem}>
                          <Text style={[styles.footerText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                            {paymentMethodDisplay(req.paymentMethod)}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.footerItem}>
                          <Text style={[styles.footerText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                            {paymentMethodDisplay(req.paymentMethod)}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.compactInfoDivider, { backgroundColor: LIST_FRAME_BORDER }]} />
                      <View style={styles.footerItem}>
                        <Text style={[styles.footerText, { color: "#2563EB", fontFamily: "Inter_700Bold" }]}>
                          {Number.isFinite(req.estimatedFare) && req.estimatedFare > 0
                            ? `ca. ${Math.round(req.estimatedFare / 1.08)}–${Math.round(req.estimatedFare)} €`
                            : "—"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {!isReservation && (
                    <View style={[styles.payerLine, { backgroundColor: "#FFFFFF", borderColor: LIST_FRAME_BORDER }]}>
                      <MaterialCommunityIcons name="wallet-outline" size={16} color={LIST_TEXT_STRONG} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.payerLineTitle, { color: colors.foreground }]}>Zahlung</Text>
                        <Text style={[styles.payerLineSub, { color: LIST_TEXT_STRONG }]}>
                          {customerPayerBlockFromRideRequest(req).subtitle}
                        </Text>
                      </View>
                    </View>
                  )}

                  {(req.status === "ready_for_dispatch" || req.status === "accepted" || req.status === "driver_arriving") && (
                    <View style={[styles.driverHint, { backgroundColor: "#16A34A11", borderColor: "#16A34A33" }]}>
                      <Feather name="check-circle" size={14} color="#16A34A" />
                      <Text style={[styles.driverHintText, { color: "#16A34A" }]}>Fahrer auf dem Weg zu dir</Text>
                    </View>
                  )}
                  {(req.status === "pending" || req.status === "requested" || req.status === "searching_driver" || req.status === "offered") && (
                    <View style={[styles.driverHint, { backgroundColor: "#F59E0B11", borderColor: "#F59E0B33" }]}>
                      <Feather name="clock" size={14} color="#D97706" />
                      <Text style={[styles.driverHintText, { color: "#D97706" }]}>Auftrag aufgegeben — Fahrer wird gesucht …</Text>
                    </View>
                  )}

                  {(req.status === "pending" ||
                    req.status === "requested" ||
                    req.status === "searching_driver" ||
                    req.status === "offered" ||
                    req.status === "ready_for_dispatch" ||
                    req.status === "accepted" ||
                    req.status === "driver_arriving" ||
                    req.status === "driver_waiting" ||
                    req.status === "passenger_onboard" ||
                    req.status === "arrived" ||
                    req.status === "in_progress") && (
                    <Pressable
                      style={[styles.liveMapRow, { borderColor: LIST_FRAME_BORDER }]}
                      onPress={() => router.push("/status")}
                    >
                      <Feather name="map" size={16} color="#DC2626" />
                      <Text style={[styles.liveMapText, { color: colors.foreground }]}>Live-Karte & Status</Text>
                      <Feather name="chevron-right" size={16} color={LIST_TEXT_STRONG} />
                    </Pressable>
                  )}

                  {!isReservation && (
                    <Pressable
                      style={[styles.rideSupportRow, { borderColor: LIST_FRAME_BORDER }]}
                      onPress={() => openRideDetail(req.id, { focusSupport: true })}
                    >
                      <Feather name="help-circle" size={16} color={colors.primary} />
                      <Text style={[styles.rideSupportText, { color: colors.foreground }]}>Hilfe</Text>
                      <Feather name="chevron-right" size={16} color={LIST_TEXT_STRONG} />
                    </Pressable>
                  )}

                  {isReservation && (
                    <View style={styles.actionRow}>
                      <Pressable
                        style={[styles.rideSupportRowCompact, { borderColor: LIST_FRAME_BORDER, flex: 1, backgroundColor: "#F3F4F6" }]}
                        onPress={() => {
                          setDriverNoteRideId(req.id);
                          setDriverNoteDraft(req.accessibilityOptions?.driverNote ?? "");
                          setDriverNoteModal(true);
                        }}
                      >
                        <Feather name="message-square" size={15} color={colors.foreground} />
                        <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Notiz an Fahrer</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.rideSupportRowCompact, { borderColor: "#EF444466", flex: 1, backgroundColor: "#EF4444" }]}
                        onPress={() =>
                          Alert.alert("Fahrt stornieren?", "Möchtest du diese Reservierung wirklich stornieren?", [
                            { text: "Nein", style: "cancel" },
                            {
                              text: "Ja, stornieren",
                              style: "destructive",
                              onPress: () => {
                                void cancelRequest(req.id, undefined, "Storno durch Kundenansicht (Meine Fahrten)");
                              },
                            },
                          ])
                        }
                      >
                        <Feather name="trash-2" size={15} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>Stornieren</Text>
                      </Pressable>
                    </View>
                  )}

                  {!isReservation && (req.status === "pending" ||
                    req.status === "scheduled" ||
                    req.status === "scheduled_assigned" ||
                    req.status === "requested" ||
                    req.status === "searching_driver" ||
                    req.status === "offered" ||
                    req.status === "ready_for_dispatch" ||
                    req.status === "accepted" ||
                    req.status === "driver_arriving" ||
                    req.status === "driver_waiting") && (
                    <Pressable
                      style={[styles.actionBtn, { borderColor: "#EF444466", backgroundColor: "#EF444408" }]}
                      onPress={() =>
                        Alert.alert("Fahrt stornieren?", "Möchtest du diesen Auftrag wirklich stornieren?", [
                          { text: "Nein", style: "cancel" },
                          {
                            text: "Ja, stornieren",
                            style: "destructive",
                            onPress: () => {
                              void cancelRequest(req.id, undefined, "Storno durch Kundenansicht (Meine Fahrten)");
                            },
                          },
                        ])
                      }
                    >
                      <Feather name="x-circle" size={15} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Fahrt stornieren</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── Abgeschlossene Fahrten (gruppiert) ── */}
        {showCompleted && groupedCompleted.map((group) => (
          <View key={group.label}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#16A34A" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{group.label}</Text>
            </View>

            {group.rides.map((ride) => {
              const date    = new Date(ride.createdAt);
              const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              return (
                <Pressable
                  key={ride.id}
                  style={[styles.rideCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}
                  onPress={() => openRideDetail(ride.id)}
                >
                  {/* Static route map image */}
                  <Image
                    source={{ uri: buildStaticMapUrl(ride.origin ?? "Esslingen am Neckar", ride.destination) }}
                    style={styles.staticMap}
                    resizeMode="cover"
                  />

                  <View style={[styles.rideHeader, { marginTop: 12 }]}>
                    <StatusBadge status="completed" />
                    <Text style={[styles.rideDate, { color: LIST_TEXT_STRONG }]}>{dateStr} · {timeStr}</Text>
                  </View>

                  <View style={styles.routeRow}>
                    <View style={styles.routeDots}>
                      <View style={[styles.dotFilled, { backgroundColor: "#111" }]} />
                      <View style={[styles.routeLine, { backgroundColor: "#6B7280" }]} />
                      <View style={[styles.dotOutline, { borderColor: colors.primary }]} />
                    </View>
                    <View style={styles.routeLabels}>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {normalizeAddressDisplay(ride.origin)?.split(",")[0] ?? "Unbekannt"}
                      </Text>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {normalizeAddressDisplay(ride.destination).split(",")[0]}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.rideFooter, { borderTopColor: LIST_FRAME_BORDER }]}>
                    <View style={styles.footerItem}>
                      <Feather name="map" size={13} color={LIST_TEXT_STRONG} />
                      <Text style={[styles.footerText, { color: LIST_TEXT_STRONG }]}>{ride.distanceKm} km</Text>
                    </View>
                    <View style={styles.footerItem}>
                      <Feather name="clock" size={13} color={LIST_TEXT_STRONG} />
                      <Text style={[styles.footerText, { color: LIST_TEXT_STRONG }]}>{Math.round(ride.distanceKm * 3)} Min.</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.ridePrice, { color: colors.foreground }]}>{formatEuro(ride.totalFare)}</Text>
                      {ride.estimatedFare != null &&
                      Math.abs(ride.estimatedFare - ride.totalFare) > 0.005 ? (
                        <Text style={[styles.footerText, { color: LIST_TEXT_STRONG, fontSize: rf(11), marginTop: 2 }]}>
                          Schätzung war {formatEuro(ride.estimatedFare)}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Aktionen: PDF-Quittung + Nochmal */}
                  <Pressable
                    style={styles.pdfBtn}
                    onPress={(ev) => {
                      // Do not trigger card navigation.
                      ev?.stopPropagation?.();
                      handleDownloadReceipt(ride);
                    }}
                  >
                    <Feather name="file-text" size={15} color="#fff" />
                    <Text style={styles.pdfBtnText}>PDF-Quittung herunterladen</Text>
                    <Feather name="download" size={14} color="#fff" />
                  </Pressable>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.rideSupportRowCompact, { borderColor: LIST_FRAME_BORDER, flex: 1 }]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        openRideDetail(ride.id, { focusSupport: true });
                      }}
                    >
                      <Feather name="help-circle" size={15} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                        Hilfe
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.repeatBtn, { flex: 1 }]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        handleRepeatRide();
                      }}
                    >
                      <Feather name="repeat" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Nochmal buchen</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* ── Stornierte Fahrten ── */}
        {showCancelled && cancelled.length > 0 && (
          <>
            {cancelled.map((ride) => {
              const date    = new Date(ride.createdAt);
              const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const byDriver = ride.cancelledBy === "driver";
              const fromMain = normalizeAddressDisplay(ride.from).split(",")[0]?.trim() ?? normalizeAddressDisplay(ride.from);
              const toMain = normalizeAddressDisplay(ride.to).split(",")[0]?.trim() ?? normalizeAddressDisplay(ride.to);
              return (
                <View
                  key={ride.id}
                  style={[styles.cancelledRideCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}
                >
                  <View style={styles.cancelledHeaderRow}>
                    <StatusBadge status={byDriver ? "rejected" : "cancelled"} />
                    <View style={styles.cancelledWhenRow}>
                      <Feather name="calendar" size={14} color={LIST_TEXT_STRONG} />
                      <Text style={[styles.cancelledWhenText, { color: LIST_TEXT_STRONG }]}>{dateStr}</Text>
                      <Text style={[styles.cancelledWhenSep, { color: LIST_TEXT_STRONG }]}>|</Text>
                      <Feather name="clock" size={14} color={LIST_TEXT_STRONG} />
                      <Text style={[styles.cancelledWhenText, { color: LIST_TEXT_STRONG }]}>{timeStr}</Text>
                    </View>
                  </View>

                  <View style={styles.cancelledRouteWrap}>
                    <View style={styles.cancelledRouteDotsCol}>
                      <View style={styles.cancelledDotOrigin} />
                      <View style={styles.cancelledRouteConnector} />
                      <View style={[styles.cancelledDotDest, { borderColor: LIST_TEXT_STRONG }]} />
                    </View>
                    <View style={styles.cancelledRouteLabelsCol}>
                      <View>
                        <Text style={[styles.cancelledAddrMain, { color: colors.foreground }]} numberOfLines={2}>
                          {fromMain}
                        </Text>
                        <Text style={[styles.cancelledAddrSub, { color: LIST_TEXT_STRONG }]}>Abholort</Text>
                      </View>
                      <View>
                        <Text style={[styles.cancelledAddrMain, { color: colors.foreground }]} numberOfLines={2}>
                          {toMain}
                        </Text>
                        <Text style={[styles.cancelledAddrSub, { color: LIST_TEXT_STRONG }]}>Zielort</Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.cancelledNotice,
                      {
                        backgroundColor: byDriver ? "#FEF2F2" : "#FFF7ED",
                        borderColor: byDriver ? "#FECACA" : "#FDBA74",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="information"
                      size={16}
                      color={byDriver ? "#EF4444" : "#EA580C"}
                    />
                    <Text
                      style={[
                        styles.cancelledNoticeTitle,
                        { color: byDriver ? "#B91C1C" : "#C2410C" },
                      ]}
                    >
                      {byDriver ? "Vom Fahrer abgelehnt" : "Von dir storniert"}
                    </Text>
                  </View>

                  <Pressable
                    style={styles.cancelledHelpSolid}
                    onPress={() => openRideDetail(ride.id, { focusSupport: true })}
                  >
                    <MaterialCommunityIcons name="headset" size={17} color="#FFFFFF" />
                    <Text style={styles.cancelledHelpSolidText}>Hilfe</Text>
                  </Pressable>
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
              {(activeTab as string) === "aktiv"         ? "Keine aktiven Fahrten"     :
               (activeTab as string) === "reservierungen" ? "Keine Reservierungen" :
               (activeTab as string) === "abgeschlossen" ? "Noch keine Fahrten"        :
               (activeTab as string) === "storniert"     ? "Keine stornierten Fahrten" :
               "Noch keine Fahrten"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {(activeTab as string) === "aktiv"
                ? "Du hast gerade keine laufenden Aufträge."
                : "Plane deine nächste Fahrt direkt hier."}
            </Text>
            {(activeTab === "alle" || activeTab === "abgeschlossen") && (
              <Pressable style={styles.newBookingBtn} onPress={() => router.replace("/booking-center")}>
                <Feather name="plus" size={18} color="#fff" />
                <Text style={styles.newBookingBtnText}>Neue Buchung</Text>
              </Pressable>
            )}
          </View>
        )}

      </ScrollView>

      <Modal visible={driverNoteModal} transparent animationType="fade" onRequestClose={() => setDriverNoteModal(false)}>
        <View style={styles.noteModalBackdrop}>
          <View style={[styles.noteModalCard, { backgroundColor: colors.card, borderColor: LIST_FRAME_BORDER }]}>
            <Text style={[styles.noteModalTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
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
        </View>
      </Modal>

      <BottomTabBar active="fahrten" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:         { width: rs(36), height: rs(36), justifyContent: "center" },
  headerTitle:     { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  scroll:          { paddingHorizontal: rs(16), paddingTop: rs(20), gap: rs(4) },

  statsRow:        { flexDirection: "row", gap: rs(10) },
  statCard:        { flex: 1, borderRadius: rs(14), borderWidth: 2, padding: rs(12), alignItems: "center", gap: rs(6) },
  statIcon:        { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: "center", justifyContent: "center" },
  statValue:       { fontSize: rf(16), fontFamily: "Inter_700Bold" },
  statLabel:       { fontSize: rf(11), fontFamily: "Inter_600SemiBold" },

  tabsRow:         { flexDirection: "row", gap: rs(8), paddingBottom: rs(4), alignItems: "center" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(5),
    minHeight: rs(38),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(18),
  },
  tabText:         { fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  tabBadge: {
    minWidth: rs(19),
    height: rs(19),
    borderRadius: rs(10),
    paddingHorizontal: rs(5),
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText:    { fontSize: rf(10), fontFamily: "Inter_700Bold" },

  sectionHeader:   { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(4), marginBottom: -2 },
  sectionDot:      { width: rs(8), height: rs(8), borderRadius: rs(4) },
  sectionTitle:    { fontSize: rf(15), fontFamily: "Inter_700Bold" },

  activeCard:      { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  rideCard:        { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  rideHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge:     { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(8) },
  statusText:      { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  rideDate:        { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },

  routeRow:        { flexDirection: "row", gap: rs(12), alignItems: "center" },
  routeDots:       { alignItems: "center", gap: rs(3) },
  dotFilled:       { width: rs(10), height: rs(10), borderRadius: rs(5) },
  routeLine:       { width: 2, height: rs(20) },
  dotOutline:      { width: rs(10), height: rs(10), borderRadius: rs(5), borderWidth: 2, backgroundColor: "transparent" },
  routeLabels:     { flex: 1, gap: rs(16) },
  compactInfoBlock: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rs(8),
    paddingHorizontal: rs(9),
    paddingVertical: rs(5),
    gap: rs(8),
  },
  compactInfoDivider: { width: 1, height: rs(14), opacity: 0.6 },
  routeLabel:      { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },

  cancelledRideCard: {
    borderRadius: rs(16),
    borderWidth: 3,
    padding: rs(16),
    gap: rs(14),
    marginBottom: rs(4),
  },
  cancelledHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(8),
  },
  cancelledWhenRow: { flexDirection: "row", alignItems: "center", gap: rs(6), flexShrink: 1 },
  cancelledWhenText: { fontSize: rf(12), fontFamily: "Inter_700Bold" },
  cancelledWhenSep: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", opacity: 0.45 },
  cancelledRouteWrap: { flexDirection: "row", gap: rs(12), alignItems: "stretch" },
  cancelledRouteDotsCol: { width: rs(14), alignItems: "center", paddingTop: rs(4) },
  cancelledDotOrigin: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: "#DC2626",
  },
  cancelledRouteConnector: {
    width: rs(2),
    flex: 1,
    minHeight: rs(22),
    backgroundColor: "#D1D5DB",
    marginVertical: rs(4),
  },
  cancelledDotDest: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    borderWidth: rs(2),
    backgroundColor: "#FFFFFF",
  },
  cancelledRouteLabelsCol: { flex: 1, gap: rs(20) },
  cancelledAddrMain: { fontSize: rf(15), fontFamily: "Inter_700Bold", lineHeight: rf(20) },
  cancelledAddrSub: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", marginTop: rs(4) },
  cancelledNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingVertical: rs(7),
    paddingHorizontal: rs(10),
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelledNoticeTitle: { flex: 1, fontSize: rf(12), fontFamily: "Inter_700Bold" },
  cancelledHelpSolid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(6),
    paddingVertical: rs(10),
    borderRadius: rs(10),
    backgroundColor: "#DC2626",
  },
  cancelledHelpSolidText: { fontSize: rf(13), fontFamily: "Inter_700Bold", color: "#FFFFFF" },

  rideFooter:      { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingTop: rs(10), gap: rs(12) },
  footerItem:      { flexDirection: "row", alignItems: "center", gap: rs(5) },
  footerText:      { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  ridePrice:       { marginLeft: "auto", fontSize: rf(18), fontFamily: "Inter_700Bold" },

  payerLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    borderRadius: rs(9),
    borderWidth: 1,
  },
  payerLineTitle: { fontSize: rf(11), fontFamily: "Inter_600SemiBold" },
  payerLineSub: { fontSize: rf(10.5), fontFamily: "Inter_600SemiBold", marginTop: rs(1), lineHeight: rf(14) },

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
    paddingVertical: rs(9),
    paddingHorizontal: rs(6),
    borderRadius: rs(10),
    borderWidth: 1,
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
    paddingVertical: rs(12),
    borderRadius: rs(10),
    backgroundColor: "#DC2626",
    marginTop: rs(8),
    marginBottom: rs(6),
  },
  pdfBtnText: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  actionBtnText:   { fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  noteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: rs(20),
  },
  noteModalCard: {
    width: "100%",
    borderRadius: rs(18),
    borderWidth: 1,
    padding: rs(16),
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
