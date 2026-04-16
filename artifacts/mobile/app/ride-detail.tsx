import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRide, VEHICLES } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { formatEuro } from "@/utils/fareCalculator";
import { downloadReceipt } from "@/utils/receipt";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rs } from "@/utils/scale";

type SupportCategory =
  | "price"
  | "driver"
  | "vehicle"
  | "route"
  | "cancel"
  | "lost_item"
  | "other";

const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { id: "price", label: "Preis / Abrechnung", icon: "cash" },
  { id: "driver", label: "Fahrer", icon: "account" },
  { id: "vehicle", label: "Fahrzeug", icon: "car" },
  { id: "route", label: "Route / Strecke", icon: "map-marker-path" },
  { id: "cancel", label: "Storno", icon: "close-circle" },
  { id: "lost_item", label: "Gegenstand vergessen", icon: "bag-suitcase" },
  { id: "other", label: "Sonstiges", icon: "help-circle" },
];

function buildReceiptFromHistory(ride: ReturnType<typeof useRide>["history"][number]) {
  const date = new Date(ride.createdAt);
  const vehicle = VEHICLES.find((v) => v.id === ride.vehicleType);
  return {
    rideId: ride.id.slice(0, 8).toUpperCase(),
    date: date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    origin: ride.origin ?? "—",
    destination: ride.destination ?? "—",
    distanceKm: ride.distanceKm ?? 0,
    durationMinutes: Math.round((ride.distanceKm ?? 0) * 3),
    vehicle: vehicle?.name ?? "Standard",
    paymentMethod: ride.paymentMethod ?? "cash",
    totalFare: ride.totalFare ?? 0,
  };
}

export default function RideDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const params = useLocalSearchParams();
  const rideId = typeof params.id === "string" ? params.id : "";

  const { history } = useRide();
  const { myActiveRequests, myCancelledRequests, requests } = useRideRequests();

  const histRide = useMemo(() => history.find((r) => r.id === rideId) ?? null, [history, rideId]);

  /** Gleiche Logik wie „Meine Fahrten“: Endpreis aus API-Poll anreichern. */
  const enrichedHistRide = useMemo(() => {
    if (!histRide || histRide.status !== "completed") return histRide;
    const srv = requests.find((r) => r.id === histRide.id && r.status === "completed");
    if (!srv) return histRide;
    const finalN =
      srv.finalFare != null && Number.isFinite(Number(srv.finalFare)) ? Number(srv.finalFare) : null;
    if (finalN == null) return histRide;
    const est = Number(srv.estimatedFare ?? 0);
    return {
      ...histRide,
      totalFare: finalN,
      estimatedFare:
        est > 0 && Math.abs(est - finalN) > 0.005 ? est : histRide.estimatedFare,
    };
  }, [histRide, requests]);
  const activeRide = useMemo(() => myActiveRequests.find((r) => r.id === rideId) ?? null, [myActiveRequests, rideId]);
  const cancelledRide = useMemo(() => myCancelledRequests.find((r) => r.id === rideId) ?? null, [myCancelledRequests, rideId]);

  const [category, setCategory] = useState<SupportCategory>("other");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apiBase = getApiBaseUrl();

  const title = enrichedHistRide
    ? enrichedHistRide.status === "completed"
      ? "Fahrt (Abgeschlossen)"
      : "Fahrt (Storniert)"
    : activeRide
      ? "Fahrt (Aktiv)"
      : cancelledRide
        ? "Fahrt (Storniert)"
        : "Fahrt";

  async function onDownloadReceipt() {
    if (!enrichedHistRide || enrichedHistRide.status !== "completed") {
      Alert.alert("Nicht verfügbar", "Eine Quittung gibt es erst nach Abschluss der Fahrt.");
      return;
    }
    await downloadReceipt(buildReceiptFromHistory(enrichedHistRide));
  }

  async function openServerReceipt() {
    if (!apiBase) {
      Alert.alert("API nicht konfiguriert", "Bitte EXPO_PUBLIC_API_URL setzen.");
      return;
    }
    if (!rideId) return;
    const url = `${apiBase}/rides/${encodeURIComponent(rideId)}/receipt`;
    try {
      const WebBrowser = await import("expo-web-browser");
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert("Nicht verfügbar", "Browser konnte nicht geöffnet werden.");
    }
  }

  async function submitSupport() {
    if (!rideId) return;
    const text = message.trim();
    if (text.length < 5) {
      Alert.alert("Bitte ergänzen", "Beschreibe das Problem kurz (mind. 5 Zeichen).");
      return;
    }
    if (!apiBase) {
      Alert.alert("API nicht konfiguriert", "Bitte EXPO_PUBLIC_API_URL setzen.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/rides/${encodeURIComponent(rideId)}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: text,
          source: "mobile_customer",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        Alert.alert("Senden fehlgeschlagen", "Bitte später erneut versuchen.");
        return;
      }
      setMessage("");
      Alert.alert("Gesendet", `Danke! Referenz: ${data.ticketId ?? "—"}`);
    } catch {
      Alert.alert("Netzwerkfehler", "Bitte später erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Übersicht</Text>

          <View style={styles.row}>
            <Text style={[styles.k, { color: colors.mutedForeground }]}>Ride-ID</Text>
            <Text style={[styles.v, { color: colors.foreground }]}>{rideId ? rideId.slice(0, 10) : "—"}</Text>
          </View>

          <View style={styles.row}>
            <Text style={[styles.k, { color: colors.mutedForeground }]}>Start</Text>
            <Text style={[styles.v, { color: colors.foreground }]} numberOfLines={2}>
              {enrichedHistRide?.origin || activeRide?.from || cancelledRide?.from || "—"}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={[styles.k, { color: colors.mutedForeground }]}>Ziel</Text>
            <Text style={[styles.v, { color: colors.foreground }]} numberOfLines={2}>
              {enrichedHistRide?.destination || activeRide?.to || cancelledRide?.to || "—"}
            </Text>
          </View>

          {enrichedHistRide?.status === "completed" ? (
            <View>
              <View style={styles.row}>
                <Text style={[styles.k, { color: colors.mutedForeground }]}>Betrag</Text>
                <Text style={[styles.v, { color: colors.foreground }]}>{formatEuro(enrichedHistRide.totalFare)}</Text>
              </View>
              {enrichedHistRide.estimatedFare != null &&
              Math.abs(enrichedHistRide.estimatedFare - enrichedHistRide.totalFare) > 0.005 ? (
                <View style={styles.row}>
                  <Text style={[styles.k, { color: colors.mutedForeground }]}>Schätzung</Text>
                  <Text style={[styles.v, { color: colors.mutedForeground }]}>{formatEuro(enrichedHistRide.estimatedFare)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable style={styles.primaryBtn} onPress={() => void onDownloadReceipt()}>
            <Feather name="file-text" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>Quittung / Beleg</Text>
            <Feather name="download" size={14} color="#fff" />
          </Pressable>
          <Pressable style={[styles.secondaryLinkBtn, { borderColor: colors.border }]} onPress={() => void openServerReceipt()}>
            <Feather name="external-link" size={14} color={colors.mutedForeground} />
            <Text style={[styles.secondaryLinkText, { color: colors.mutedForeground }]}>Beleg im Browser öffnen (API)</Text>
          </Pressable>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Hinweis: Bei iOS/Android öffnet sich der Druckdialog (Speichern als PDF möglich).
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Problem melden</Text>

          <View style={styles.categoryWrap}>
            {SUPPORT_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[
                    styles.categoryChip,
                    {
                      borderColor: on ? "#DC2626" : colors.border,
                      backgroundColor: on ? "#DC262615" : colors.background,
                    },
                  ]}
                  onPress={() => setCategory(c.id)}
                >
                  <MaterialCommunityIcons name={c.icon} size={14} color={on ? "#DC2626" : colors.mutedForeground} />
                  <Text style={[styles.chipText, { color: on ? "#DC2626" : colors.mutedForeground }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Beschreibe kurz, was passiert ist …"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.textArea,
              {
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />

          <Pressable
            style={[styles.secondaryBtn, { opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={() => void submitSupport()}
          >
            <Feather name="send" size={14} color="#DC2626" />
            <Text style={[styles.secondaryBtnText, { color: "#DC2626" }]}>
              {submitting ? "Senden …" : "An Support senden"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 6 },
  k: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: rs(92) },
  v: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "right" },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  hint: { marginTop: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 110,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#DC262615",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  secondaryLinkBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryLinkText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

