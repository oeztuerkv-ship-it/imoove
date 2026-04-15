import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRide, type PaymentMethod, VEHICLES } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { customerPayerBlockFromRideRequest } from "@/utils/customerBillingCopy";
import { formatEuro } from "@/utils/fareCalculator";
import { downloadReceipt } from "@/utils/receipt";
import { rs, rf } from "@/utils/scale";

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

type FilterTab = "alle" | "aktiv" | "abgeschlossen" | "storniert";

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const config = {
    requested:   { label: "Anfrage erfasst",    bg: "#F59E0B22", fg: "#D97706" },
    searching_driver: { label: "Fahrer wird gesucht", bg: "#F59E0B22", fg: "#D97706" },
    offered:     { label: "Angebot läuft",      bg: "#F59E0B22", fg: "#D97706" },
    pending:     { label: "Warte auf Fahrer", bg: "#F59E0B22", fg: "#D97706" },
    accepted:    { label: "Fahrer kommt",     bg: "#16A34A22", fg: "#16A34A" },
    driver_arriving: { label: "Fahrer unterwegs", bg: "#16A34A22", fg: "#16A34A" },
    driver_waiting: { label: "Fahrer wartet", bg: "#16A34A22", fg: "#16A34A" },
    passenger_onboard: { label: "Kunde an Bord", bg: "#2563EB22", fg: "#2563EB" },
    in_progress: { label: "Fahrt läuft",      bg: "#2563EB22", fg: "#2563EB" },
    completed:   { label: "Abgeschlossen",    bg: colors.success + "22", fg: colors.success },
    cancelled_by_customer: { label: "Storniert", bg: "#EF444422", fg: "#EF4444" },
    cancelled_by_driver: { label: "Vom Fahrer storniert", bg: "#EF444422", fg: "#EF4444" },
    cancelled_by_system: { label: "Systemstorno", bg: "#EF444422", fg: "#EF4444" },
    expired: { label: "Abgelaufen", bg: "#EF444422", fg: "#EF4444" },
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
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const { history } = useRide();
  const { myActiveRequests, myCancelledRequests, cancelRequest } = useRideRequests();
  const [activeTab, setActiveTab] = useState<FilterTab>("alle");

  const completed = history.filter((r) => r.status === "completed");
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
    { id: "aktiv",         label: "Aktiv",         count: myActiveRequests.length || undefined },
    { id: "abgeschlossen", label: "Abgeschlossen",  count: completed.length || undefined },
    { id: "storniert",     label: "Storniert",      count: cancelled.length || undefined },
  ];

  const showActive    = activeTab === "alle" || activeTab === "aktiv";
  const showCompleted = activeTab === "alle" || activeTab === "abgeschlossen";
  const showCancelled = activeTab === "storniert";
  const isEmpty       =
    (showActive    && myActiveRequests.length === 0) &&
    (showCompleted && completed.length === 0) &&
    (!showCancelled || cancelled.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={{ width: 40 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Meine Fahrten</Text>
        <Pressable
          style={styles.backBtn}
          hitSlop={12}
          onPress={() => router.push("/reserve-ride")}
          accessibilityLabel="Neue Buchung – Reservieren"
        >
          <Feather name="plus-circle" size={24} color="#DC2626" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Stats ── */}
        {completed.length > 0 && (
          <View style={styles.statsRow}>
            <StatCard icon="navigation" value={String(completed.length)} label="Fahrten"  color="#2563EB" />
            <StatCard icon="map"        value={totalKm.toFixed(0) + " km"} label="Gesamt"  color="#D97706" />
            <StatCard icon="credit-card" value={formatEuro(totalSpent)} label="Ausgaben" color="#16A34A" />
          </View>
        )}

        {/* ── Filter Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tab, isActive && { backgroundColor: "#DC2626", borderColor: "#DC2626" }, !isActive && { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, { color: isActive ? "#fff" : colors.mutedForeground }]}>
                  {tab.label}
                </Text>
                {tab.count !== undefined && (
                  <View style={[styles.tabBadge, { backgroundColor: isActive ? "#fff3" : colors.muted }]}>
                    <Text style={[styles.tabBadgeText, { color: isActive ? "#fff" : colors.mutedForeground }]}>
                      {tab.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Aktive Aufträge ── */}
        {showActive && myActiveRequests.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#2563EB" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Aktive Aufträge</Text>
            </View>

            {myActiveRequests.map((req) => {
              const hasPickup = req.scheduledAt != null;
              const when = hasPickup ? new Date(req.scheduledAt as Date) : new Date(req.createdAt);
              const dateStr = when.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const whenLabel = hasPickup ? `Abholung ${dateStr} · ${timeStr} Uhr` : `${timeStr} Uhr · gebucht`;
              return (
                <View key={req.id} style={[styles.activeCard, { backgroundColor: "#1E3A5F08", borderColor: "#2563EB33" }]}>
                  <View style={styles.rideHeader}>
                    <StatusBadge status={req.status} />
                    <Text style={[styles.rideDate, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {whenLabel}
                    </Text>
                  </View>

                  <View style={styles.routeRow}>
                    <View style={styles.routeDots}>
                      <View style={[styles.dotFilled, { backgroundColor: "#111" }]} />
                      <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                      <View style={[styles.dotOutline, { borderColor: "#DC2626" }]} />
                    </View>
                    <View style={styles.routeLabels}>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>{req.from}</Text>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>{req.to}</Text>
                    </View>
                  </View>

                  <View style={[styles.rideFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.footerItem}>
                      <Feather name="map" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{req.distanceKm.toFixed(1)} km</Text>
                    </View>
                    <View style={[styles.footerItem, { backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }]}>
                      <Text style={[styles.footerText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{req.vehicle}</Text>
                    </View>
                    <Text style={[styles.ridePrice, { color: "#2563EB" }]}>
                      ca. {Math.round(req.estimatedFare / 1.08)}–{Math.round(req.estimatedFare)} €
                    </Text>
                  </View>

                  <View style={[styles.payerLine, { backgroundColor: "#F8FAFC", borderColor: colors.border }]}>
                    <MaterialCommunityIcons name="information-outline" size={14} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payerLineTitle, { color: colors.foreground }]}>
                        {customerPayerBlockFromRideRequest(req).title}
                      </Text>
                      <Text style={[styles.payerLineSub, { color: colors.mutedForeground }]}>
                        {customerPayerBlockFromRideRequest(req).subtitle}
                      </Text>
                    </View>
                  </View>

                  {(req.status === "accepted" || req.status === "driver_arriving") && (
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
                    req.status === "accepted" ||
                    req.status === "driver_arriving" ||
                    req.status === "driver_waiting" ||
                    req.status === "passenger_onboard" ||
                    req.status === "arrived" ||
                    req.status === "in_progress") && (
                    <Pressable
                      style={[styles.liveMapRow, { borderColor: colors.border }]}
                      onPress={() => router.push("/status")}
                    >
                      <Feather name="map" size={16} color="#DC2626" />
                      <Text style={[styles.liveMapText, { color: colors.foreground }]}>Live-Karte & Status</Text>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  )}

                  {(req.status === "pending" ||
                    req.status === "requested" ||
                    req.status === "searching_driver" ||
                    req.status === "offered" ||
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
                              void (async () => {
                                try {
                                  await cancelRequest(req.id, undefined, "Storno durch Kundenansicht (Meine Fahrten)");
                                } catch (error) {
                                  const code = error instanceof Error ? error.message : "";
                                  Alert.alert(
                                    "Storno fehlgeschlagen",
                                    code ? `Technisch: ${code}` : "Bitte erneut versuchen.",
                                  );
                                }
                              })();
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
                <View key={ride.id} style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Static route map image */}
                  <Image
                    source={{ uri: buildStaticMapUrl(ride.origin ?? "Esslingen am Neckar", ride.destination) }}
                    style={styles.staticMap}
                    resizeMode="cover"
                  />

                  <View style={[styles.rideHeader, { marginTop: 12 }]}>
                    <StatusBadge status="completed" />
                    <Text style={[styles.rideDate, { color: colors.mutedForeground }]}>{dateStr} · {timeStr}</Text>
                  </View>

                  <View style={styles.routeRow}>
                    <View style={styles.routeDots}>
                      <View style={[styles.dotFilled, { backgroundColor: "#111" }]} />
                      <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                      <View style={[styles.dotOutline, { borderColor: colors.primary }]} />
                    </View>
                    <View style={styles.routeLabels}>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {ride.origin?.split(",")[0] ?? "Unbekannt"}
                      </Text>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]} numberOfLines={1}>
                        {ride.destination.split(",")[0]}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.rideFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.footerItem}>
                      <Feather name="map" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{ride.distanceKm} km</Text>
                    </View>
                    <View style={styles.footerItem}>
                      <Feather name="clock" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{Math.round(ride.distanceKm * 3)} Min.</Text>
                    </View>
                    <Text style={[styles.ridePrice, { color: colors.foreground }]}>{formatEuro(ride.totalFare)}</Text>
                  </View>

                  {/* Aktionen: PDF-Quittung + Nochmal */}
                  <Pressable
                    style={styles.pdfBtn}
                    onPress={() => handleDownloadReceipt(ride)}
                  >
                    <Feather name="file-text" size={15} color="#fff" />
                    <Text style={styles.pdfBtnText}>PDF-Quittung herunterladen</Text>
                    <Feather name="download" size={14} color="#fff" />
                  </Pressable>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.repeatBtn, { flex: 1 }]}
                      onPress={handleRepeatRide}
                    >
                      <Feather name="repeat" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Nochmal buchen</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Stornierte Fahrten ── */}
        {showCancelled && cancelled.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#EF4444" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Stornierte Fahrten</Text>
            </View>

            {cancelled.map((ride) => {
              const date    = new Date(ride.createdAt);
              const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const byDriver = ride.cancelledBy === "driver";
              return (
                <View key={ride.id} style={[styles.rideCard, { backgroundColor: colors.card, borderColor: "#EF444422", opacity: 0.85 }]}>
                  <View style={styles.rideHeader}>
                    <StatusBadge status={byDriver ? "rejected" : "cancelled"} />
                    <Text style={[styles.rideDate, { color: colors.mutedForeground }]}>{dateStr} · {timeStr}</Text>
                  </View>

                  <View style={styles.routeRow}>
                    <View style={styles.routeDots}>
                      <View style={[styles.dotFilled, { backgroundColor: "#9CA3AF" }]} />
                      <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
                      <View style={[styles.dotOutline, { borderColor: "#9CA3AF" }]} />
                    </View>
                    <View style={styles.routeLabels}>
                      <Text style={[styles.routeLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ride.from.split(",")[0]}
                      </Text>
                      <Text style={[styles.routeLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ride.to.split(",")[0]}
                      </Text>
                    </View>
                  </View>

                  {/* Hinweis: wer storniert hat */}
                  <View style={[styles.cancelHint, { backgroundColor: byDriver ? "#EF444408" : "#F59E0B08", borderColor: byDriver ? "#EF444433" : "#F59E0B33" }]}>
                    <Feather name={byDriver ? "user-x" : "x-circle"} size={13} color={byDriver ? "#EF4444" : "#D97706"} />
                    <Text style={[styles.cancelHintText, { color: byDriver ? "#EF4444" : "#D97706" }]}>
                      {byDriver ? "Vom Fahrer abgelehnt" : "Von dir storniert"}
                    </Text>
                  </View>

                  <Pressable
                    style={[styles.actionBtn, { borderColor: "#DC262633", backgroundColor: "#DC262608" }]}
                    onPress={handleRepeatRide}
                  >
                    <Feather name="repeat" size={14} color="#DC2626" />
                    <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Route nochmal buchen</Text>
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
              <Pressable style={styles.newBookingBtn} onPress={() => router.push("/reserve-ride")}>
                <Feather name="plus" size={18} color="#fff" />
                <Text style={styles.newBookingBtnText}>Neue Buchung</Text>
              </Pressable>
            )}
          </View>
        )}

      </ScrollView>
      <BottomTabBar active="fahrten" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: rs(20), paddingBottom: rs(14), borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:         { width: rs(40), height: rs(40), justifyContent: "center" },
  headerTitle:     { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },
  content:         { padding: rs(16), gap: rs(14), paddingBottom: rs(40) },

  statsRow:        { flexDirection: "row", gap: rs(10) },
  statCard:        { flex: 1, borderRadius: rs(14), borderWidth: 1, padding: rs(12), alignItems: "center", gap: rs(6) },
  statIcon:        { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: "center", justifyContent: "center" },
  statValue:       { fontSize: rf(16), fontFamily: "Inter_700Bold" },
  statLabel:       { fontSize: rf(11), fontFamily: "Inter_400Regular" },

  tabsRow:         { flexDirection: "row", gap: rs(8), paddingBottom: rs(2) },
  tab:             { flexDirection: "row", alignItems: "center", gap: rs(6), paddingHorizontal: rs(14), paddingVertical: rs(8), borderRadius: rs(20), borderWidth: 1 },
  tabText:         { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  tabBadge:        { borderRadius: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(1) },
  tabBadgeText:    { fontSize: rf(11), fontFamily: "Inter_600SemiBold" },

  sectionHeader:   { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(4), marginBottom: -2 },
  sectionDot:      { width: rs(8), height: rs(8), borderRadius: rs(4) },
  sectionTitle:    { fontSize: rf(15), fontFamily: "Inter_600SemiBold" },

  activeCard:      { borderRadius: rs(16), borderWidth: 1.5, padding: rs(16), gap: rs(12) },
  rideCard:        { borderRadius: rs(16), borderWidth: 1,   padding: rs(16), gap: rs(12) },
  rideHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge:     { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(8) },
  statusText:      { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  rideDate:        { fontSize: rf(12), fontFamily: "Inter_400Regular" },

  routeRow:        { flexDirection: "row", gap: rs(12), alignItems: "center" },
  routeDots:       { alignItems: "center", gap: rs(3) },
  dotFilled:       { width: rs(10), height: rs(10), borderRadius: rs(5) },
  routeLine:       { width: 2, height: rs(20) },
  dotOutline:      { width: rs(10), height: rs(10), borderRadius: rs(5), borderWidth: 2, backgroundColor: "transparent" },
  routeLabels:     { flex: 1, gap: rs(14) },
  routeLabel:      { fontSize: rf(14), fontFamily: "Inter_500Medium" },

  rideFooter:      { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: rs(10), gap: rs(12) },
  footerItem:      { flexDirection: "row", alignItems: "center", gap: rs(5) },
  footerText:      { fontSize: rf(12), fontFamily: "Inter_400Regular" },
  ridePrice:       { marginLeft: "auto", fontSize: rf(18), fontFamily: "Inter_700Bold" },

  payerLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    padding: rs(10),
    borderRadius: rs(10),
    borderWidth: 1,
  },
  payerLineTitle: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  payerLineSub: { fontSize: rf(11), fontFamily: "Inter_400Regular", marginTop: rs(2), lineHeight: rf(15) },

  driverHint:      { flexDirection: "row", alignItems: "center", gap: rs(8), padding: rs(10), borderRadius: rs(10), borderWidth: 1 },
  driverHintText:  { fontSize: rf(13), fontFamily: "Inter_500Medium" },
  liveMapRow:      { flexDirection: "row", alignItems: "center", gap: rs(10), paddingVertical: rs(12), paddingHorizontal: rs(12), borderRadius: rs(12), borderWidth: 1, marginTop: rs(2) },
  liveMapText:     { flex: 1, fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  cancelHint:      { flexDirection: "row", alignItems: "center", gap: rs(8), padding: rs(10), borderRadius: rs(10), borderWidth: 1, marginTop: rs(2) },
  cancelHintText:  { fontSize: rf(13), fontFamily: "Inter_500Medium" },

  actionRow:       { flexDirection: "row", gap: rs(8), marginTop: rs(2) },
  receiptBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(7), paddingVertical: rs(11), borderRadius: rs(10), borderWidth: 1 },
  repeatBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(7), paddingVertical: rs(11), borderRadius: rs(10), borderWidth: 1.5, borderColor: "#DC262633" },
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
  actionBtnText:   { fontSize: rf(13), fontFamily: "Inter_500Medium" },

  emptyState:      { alignItems: "center", gap: rs(12), paddingTop: rs(70) },
  emptyIcon:       { width: rs(80), height: rs(80), borderRadius: rs(24), backgroundColor: "#DC262612", alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle:      { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },
  emptyText:       { fontSize: rf(14), fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: rs(32), lineHeight: rf(20) },
  newBookingBtn:   { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: "#DC2626", borderRadius: rs(14), paddingHorizontal: rs(24), paddingVertical: rs(14), marginTop: rs(8) },
  newBookingBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
});
