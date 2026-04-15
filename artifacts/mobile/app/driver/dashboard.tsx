import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { connectToRide, disconnectSocket, sendDriverLocation as socketSendDriver } from "@/utils/socket";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

import { RealMapView } from "@/components/RealMapView";
import MapView from "react-native-maps";
import { type DriverProfile, useDriver } from "@/context/DriverContext";
import { useRide } from "@/context/RideContext";
import { type RideRequest, useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { formatEuro } from "@/utils/fareCalculator";
import { requestNotificationPermissions, sendNewRideNotification, stopRideSound } from "@/utils/notifications";

/** Krankenkassen-/Eigenanteil-Fahrten (vom Kunden gebucht). */
function isKrankenkasseRide(paymentMethod: string) {
  return paymentMethod.startsWith("Krankenkasse");
}

function accessCodeErrorMessage(code: string): string {
  const m: Record<string, string> = {
    access_code_invalid: "Der eingegebene Code ist ungueltig oder unbekannt.",
    access_code_inactive: "Dieser Code ist deaktiviert.",
    access_code_not_yet_valid: "Dieser Code ist noch nicht gueltig (Startdatum/Zeit der Freigabe).",
    access_code_expired: "Dieser Code ist abgelaufen.",
    access_code_exhausted: "Dieser Code wurde bereits vollstaendig eingeloest.",
    access_code_wrong_company: "Dieser Code passt nicht zu diesem Unternehmen.",
    request_failed: "Die Fahrt konnte nicht erstellt werden.",
  };
  return m[code] ?? "Die Fahrt konnte nicht erstellt werden.";
}

function accessCodeTypeDe(t: string): string {
  const m: Record<string, string> = {
    voucher: "Gutschein",
    hotel: "Hotel",
    company: "Firma",
    general: "Fahrcode",
  };
  return m[t] ?? "Code";
}

/** Kurzinfo für Fahrer: kein Klartext-Code, nur Label + Typ. */
function accessCodeRideLine(req: RideRequest): string | null {
  if (req.authorizationSource !== "access_code") return null;
  const s = req.accessCodeSummary;
  if (s?.label) return `Freigabe · ${s.label} (${accessCodeTypeDe(s.codeType)})`;
  return "Freigabe · Zugangscode (gültig)";
}

function parseEuroDriverInput(text: string): number | null {
  const n = parseFloat(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const MOCK_RIDES = [
  { id: "F-001", date: "01.04.2026", time: "08:14", from: "Bahnhof Esslingen", to: "Plochingen", km: 6.2, duration: 14, amount: 19.90, payment: "Bar" },
  { id: "F-002", date: "01.04.2026", time: "09:42", from: "Marktplatz", to: "Flughafen Stuttgart", km: 28.4, duration: 31, amount: 78.50, payment: "Kreditkarte" },
  { id: "F-003", date: "31.03.2026", time: "17:05", from: "Zollberg", to: "Bahnhof Esslingen", km: 3.8, duration: 9, amount: 15.70, payment: "Bar" },
  { id: "F-004", date: "31.03.2026", time: "11:30", from: "Mettingen", to: "Nürtingen", km: 11.5, duration: 18, amount: 32.20, payment: "PayPal" },
  { id: "F-005", date: "30.03.2026", time: "20:15", from: "Bahnhof Esslingen", to: "Stuttgart Mitte", km: 19.8, duration: 26, amount: 54.30, payment: "Bar" },
  { id: "F-006", date: "30.03.2026", time: "14:00", from: "Oberesslingen", to: "Ostfildern", km: 5.1, duration: 11, amount: 17.90, payment: "Kreditkarte" },
  { id: "F-007", date: "29.03.2026", time: "07:55", from: "Berkheim", to: "Flughafen Stuttgart", km: 25.2, duration: 28, amount: 68.80, payment: "Bar" },
];

const API_BASE = getApiBaseUrl();

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Tab = "uebersicht" | "auftraege" | "fahrten" | "geldbeutel" | "profil";
type ActivePhase = "pickup" | "driving";

/* ─── Helpers ─── */
function fmt(d: Date) {
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yy = d.getFullYear();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return { date: `${dd}.${mm}.${yy}`, time: `${h}:${m}` };
}

function minutesUntil(d: Date) {
  return Math.round((d.getTime() - Date.now()) / 60000);
}

function canActivate(scheduledAt: Date) {
  return minutesUntil(scheduledAt) <= 45;
}

/* ─── Pulsing dot ─── */
function PulsingDot({ color = "#22C55E" }: { color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ width: 16, height: 16, justifyContent: "center", alignItems: "center" }}>
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, transform: [{ scale: anim }], opacity: 0.5, position: "absolute" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function customerShortLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 3).toLowerCase();
  return `${parts[0]!.slice(0, 3).toLowerCase()} ${parts[parts.length - 1]!.slice(0, 1).toLowerCase()}.`;
}

/* ─── Sofortfahrt-Karte (hell, Google-ähnlich) — ohne Preis / Taxameter ─── */
function InstantCard({ req, onAccept, onReject, driverPos }: { req: RideRequest; onAccept: () => void; onReject: () => void; driverPos?: { lat: number; lon: number } | null }) {
  const distToPickupM =
    driverPos && req.fromLat != null && req.fromLon != null
      ? haversineDistance(driverPos.lat, driverPos.lon, req.fromLat, req.fromLon)
      : null;
  const distPickupLabel =
    distToPickupM != null
      ? distToPickupM < 1000
        ? `${Math.round(distToPickupM)} m entfernt`
        : `${(distToPickupM / 1000).toFixed(1)} km entfernt`
      : null;
  const { date, time } = fmt(req.createdAt);
  const codeLine = accessCodeRideLine(req);
  const payLabel = isKrankenkasseRide(req.paymentMethod) ? "Krankenkasse" : req.paymentMethod || "Bar";

  const pillGray = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  } as const;
  const pillRed = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  } as const;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 14,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#22C55E",
        backgroundColor: "#fff",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#F0FDF4",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#0F172A" }}>Sofortfahrt</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#64748B" }}>
          {date} · {time} Uhr
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
        {distPickupLabel ? (
          <View style={pillRed}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#B91C1C" }}>{distPickupLabel}</Text>
          </View>
        ) : null}
        <View style={pillGray}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#475569" }}>
            {req.distanceKm.toFixed(1)} km
          </Text>
        </View>
        <View style={pillGray}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#475569" }}>{req.vehicle}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E", marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#64748B", letterSpacing: 0.5 }}>VON</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }} numberOfLines={2}>
              {req.fromFull}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#DC2626", marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#64748B", letterSpacing: 0.5 }}>BIS</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }} numberOfLines={2}>
              {req.toFull}
            </Text>
          </View>
        </View>
      </View>

      {codeLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          <Feather name="shield" size={14} color="#16A34A" />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#15803D" }} numberOfLines={2}>
            {codeLine}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#334155" }}>{customerShortLabel(req.customerName)}</Text>
        <Text style={{ color: "#CBD5E1" }}>·</Text>
        <MaterialCommunityIcons name="cash" size={16} color="#64748B" />
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#475569" }}>{payLabel}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 16 }}>
        <Pressable
          onPress={onReject}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 14,
            paddingVertical: 14,
            borderWidth: 2,
            borderColor: "#DC2626",
            backgroundColor: pressed ? "#FEF2F2" : "#fff",
          })}
        >
          <Feather name="x" size={18} color="#DC2626" />
          <Text style={{ color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 15 }}>Ablehnen</Text>
        </Pressable>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => ({
            flex: 2,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 14,
            paddingVertical: 14,
            backgroundColor: pressed ? "#15803D" : "#16A34A",
          })}
        >
          <Feather name="check" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 }}>Annehmen</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Scheduled Request Card ─── */
function ScheduledCard({ req, onAccept, onReject, driverPos }: { req: RideRequest; onAccept: () => void; onReject: () => void; driverPos?: { lat: number; lon: number } | null }) {
  const codeLine = accessCodeRideLine(req);
  const { date, time } = fmt(new Date(req.scheduledAt!));
  const distToPickup = (driverPos && req.fromLat != null && req.fromLon != null)
    ? haversineDistance(driverPos.lat, driverPos.lon, req.fromLat, req.fromLon) / 1000
    : null;
  const minsLeft = minutesUntil(new Date(req.scheduledAt!));
  const activatable = minsLeft <= 45;
  const hoursLeft = Math.floor(minsLeft / 60);
  const minRest = minsLeft % 60;
  const countdownText = minsLeft <= 0 ? "Jetzt" : hoursLeft > 0 ? `in ${hoursLeft} Std. ${minRest} Min.` : `in ${minsLeft} Min.`;

  return (
    <View style={[styles.reqCard, styles.reqCardScheduled]}>
      {/* Header */}
      <View style={[styles.reqCardTop, { backgroundColor: "#FFFBEB" }]}>
        <View style={styles.reqTopLeft}>
          <Feather name="calendar" size={14} color="#D97706" />
          <Text style={[styles.reqNewLabel, { color: "#B45309" }]}>Vorbestellung</Text>
        </View>
        <View style={[styles.schedPill, { backgroundColor: activatable ? "#22C55E" : "#F59E0B" }]}>
          <Text style={styles.schedPillText}>{activatable ? "Bereit" : countdownText}</Text>
        </View>
      </View>

      {/* Big time display */}
      <View style={styles.schedTimeBlock}>
        <View style={styles.schedTimeRow}>
          <Feather name="clock" size={18} color="#D97706" />
          <Text style={styles.schedTimeValue}>{time} Uhr</Text>
          <Text style={styles.schedDateValue}>{date}</Text>
        </View>
      </View>

      {/* Route: Von → Bis */}
      <View style={styles.schedRoute}>
        <View style={styles.schedRouteRow}>
          <View style={styles.dotGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reqRouteLabel}>Von</Text>
            <Text style={styles.reqRouteAddr} numberOfLines={1}>{req.fromFull}</Text>
          </View>
        </View>
        <View style={styles.reqRouteLine} />
        <View style={styles.schedRouteRow}>
          <View style={styles.dotRed} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reqRouteLabel}>Bis</Text>
            <Text style={styles.reqRouteAddr} numberOfLines={1}>{req.toFull}</Text>
          </View>
        </View>
      </View>

      {/* Stats row: km · Dauer · ca. Preis */}
      <View style={styles.schedStats}>
        <View style={styles.schedStatItem}>
          <Feather name="map-pin" size={12} color="#6B7280" />
          <Text style={styles.schedStatText}>{req.distanceKm.toFixed(1)} km</Text>
        </View>
        {distToPickup != null && (
          <>
            <View style={styles.schedStatDivider} />
            <View style={styles.schedStatItem}>
              <Feather name="navigation" size={12} color="#DC2626" />
              <Text style={[styles.schedStatText, { color: "#DC2626" }]}>
                {distToPickup < 1 ? `${Math.round(distToPickup * 1000)} m` : `${distToPickup.toFixed(1)} km`} entfernt
              </Text>
            </View>
          </>
        )}
        <View style={styles.schedStatDivider} />
        <View style={styles.schedStatItem}>
          <Feather name="credit-card" size={12} color="#6B7280" />
          <Text style={styles.schedStatText}>
            {isKrankenkasseRide(req.paymentMethod) ? "Krankenkasse" : req.paymentMethod}
          </Text>
        </View>
        <View style={styles.schedStatDivider} />
        <View style={styles.schedStatItem}>
          <Feather name="clock" size={12} color="#6B7280" />
          <Text style={styles.schedStatText}>{Math.max(1, Math.round(req.durationMinutes || 0))} Min</Text>
        </View>
      </View>

      {codeLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 6 }}>
          <Feather name="shield" size={14} color="#16A34A" />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#15803D" }} numberOfLines={2}>
            {codeLine}
          </Text>
        </View>
      ) : null}

      {/* Meta */}
      <View style={styles.reqMeta}>
        <Feather name="user" size={12} color="#6B7280" />
        <Text style={styles.reqMetaText}>{req.customerName}</Text>
        <View style={styles.metaSep} />
        <Text style={styles.reqMetaText}>{req.vehicle}</Text>
      </View>

      {/* Countdown-Info wenn noch weit weg */}
      {!activatable && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF9C3", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, marginHorizontal: 14 }}>
          <Feather name="clock" size={13} color="#CA8A04" />
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#92400E" }}>
            Abholung {countdownText} — Vorbestellung annehmen
          </Text>
        </View>
      )}

      {/* Annehmen + Ablehnen — immer sichtbar */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 4, paddingHorizontal: 14 }}>
        <Pressable style={[styles.rejectBtn, { flex: 1 }]} onPress={onReject}>
          <Feather name="x" size={16} color="#DC2626" />
          <Text style={styles.rejectText}>Ablehnen</Text>
        </Pressable>
        <Pressable style={[styles.acceptBtn, { flex: 2 }]} onPress={onAccept}>
          <Feather name="check" size={18} color="#fff" />
          <Text style={styles.acceptText}>Annehmen</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Tab: Übersicht — Live-Karte mit Fahrerstandort + Auftrag-Popup ─── */
function TabUebersicht({ pendingRequests, onAccept, onReject, driverPos, isAvailable }: {
  pendingRequests: RideRequest[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  driverPos?: { lat: number; lon: number } | null;
  isAvailable: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const prevCountRef = useRef(pendingRequests.length);
  const instantReqs = pendingRequests.filter((r) => !r.scheduledAt);
  const firstReq = instantReqs[0] ?? null;

  // Slide in the card when a new request appears
  useEffect(() => {
    if (instantReqs.length > prevCountRef.current && firstReq) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    }
    if (instantReqs.length === 0) {
      slideAnim.setValue(300);
    }
    prevCountRef.current = instantReqs.length;
  }, [instantReqs.length, firstReq]);

  // Slide in on mount if request already present
  useEffect(() => {
    if (firstReq) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    }
  }, []);

  const mapLat = driverPos?.lat ?? 48.7394;
  const mapLon = driverPos?.lon ?? 9.3114;

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 32 }}>
        <MaterialCommunityIcons name="taxi" size={56} color="#DC2626" />
        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#111" }}>
          {isAvailable ? "Warte auf Aufträge..." : "Offline"}
        </Text>
        {firstReq && (
          <InstantCard req={firstReq} driverPos={driverPos}
            onAccept={() => onAccept(firstReq.id)}
            onReject={() => onReject(firstReq.id)} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Full-screen live map */}
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={"google" as any}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        initialRegion={{ latitude: mapLat, longitude: mapLon, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        region={driverPos ? { latitude: driverPos.lat, longitude: driverPos.lon, latitudeDelta: 0.04, longitudeDelta: 0.04 } : undefined}
      />

      {/* Status chip top-center */}
      <View style={styles.mapStatusChip}>
        <View style={[styles.mapStatusDot, { backgroundColor: isAvailable ? "#22C55E" : "#6B7280" }]} />
        <Text style={styles.mapStatusText}>
          {isAvailable
            ? firstReq
              ? `${instantReqs.length} ${instantReqs.length > 1 ? "Aufträge" : "Auftrag"} wartend`
              : "Warte auf Aufträge"
            : "Offline — Keine Aufträge"}
        </Text>
      </View>

      {/* Ride request popup — slides up from bottom */}
      {firstReq && (
        <Animated.View style={[styles.mapReqOverlay, { transform: [{ translateY: slideAnim }] }]}>
          <InstantCard
            req={firstReq}
            driverPos={driverPos}
            onAccept={() => onAccept(firstReq.id)}
            onReject={() => onReject(firstReq.id)}
          />
          {instantReqs.length > 1 && (
            <Text style={styles.mapMoreReqs}>+{instantReqs.length - 1} weitere Anfrage{instantReqs.length > 2 ? "n" : ""}</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Tab: Bestellungen (Vorbestellungen) ─── */
function TabBestellungen({ pendingRequests, onAccept, onReject, driverPos }: {
  pendingRequests: RideRequest[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  driverPos?: { lat: number; lon: number } | null;
}) {
  const colors = useColors();
  const scheduled = pendingRequests.filter((r) => !!r.scheduledAt);
  if (scheduled.length === 0) {
    return (
      <View style={styles.emptyCenter}>
        <Feather name="calendar" size={56} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Bestellungen</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Noch keine Vorbestellungen eingegangen</Text>
      </View>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      {/* Sort by scheduled time ascending */}
      {[...scheduled].sort((a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
      ).map((req) => (
        <ScheduledCard key={req.id} req={req} driverPos={driverPos}
          onAccept={() => onAccept(req.id)}
          onReject={() => onReject(req.id)} />
      ))}
    </ScrollView>
  );
}

/* ─── Tab: Karte ─── */
function TabKarte({ pendingRequests }: { pendingRequests: RideRequest[] }) {
  const colors = useColors();
  const activeReq = pendingRequests[0] ?? null;
  const origin = activeReq?.fromLat
    ? { lat: activeReq.fromLat, lon: activeReq.fromLon!, displayName: activeReq.fromFull }
    : { lat: 48.7394, lon: 9.3114, displayName: "Esslingen am Neckar" };
  const destination = activeReq?.toLat
    ? { lat: activeReq.toLat, lon: activeReq.toLon!, displayName: activeReq.toFull }
    : null;

  return (
    <View style={styles.mapTabContainer}>
      <RealMapView origin={origin} destination={destination ?? undefined} style={StyleSheet.absoluteFillObject} />
      <View style={styles.mapOverlay}>
        <View style={styles.mapCard}>
          {activeReq ? (
            <>
              <View style={styles.mapCardRow}>
                <PulsingDot />
                <Text style={styles.mapCardTitle}>Abholpunkt</Text>
              </View>
              <Text style={styles.mapCardAddr} numberOfLines={2}>{activeReq.fromFull}</Text>
              <View style={styles.mapCardDivider} />
              <View style={styles.mapCardStats}>
                <View style={styles.mapStatItem}>
                  <Text style={styles.mapStatValue}>{activeReq.distanceKm.toFixed(1)} km</Text>
                  <Text style={styles.mapStatLabel}>Entfernung</Text>
                </View>
                <View style={styles.mapStatDivider} />
                <View style={styles.mapStatItem}>
                  <Text style={[styles.mapStatValue, { color: "#0F172A" }]}>
                    {Math.max(1, Math.round(activeReq.durationMinutes || 0))} Min
                  </Text>
                  <Text style={styles.mapStatLabel}>Fahrtzeit (ca.)</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.mapCardTitle, { color: "#6B7280" }]}>Keine aktive Anfrage</Text>
              <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Warte auf Fahrtanfragen...</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/* ─── Tab: Fahrten ─── */
function TabFahrten({ allRides }: { allRides: typeof MOCK_RIDES }) {
  const colors = useColors();
  const [activeFilter, setActiveFilter] = useState<"heute" | "woche" | "alle">("alle");
  const todayStr = fmt(new Date()).date;
  const displayed = activeFilter === "heute"
    ? allRides.filter((r) => r.date === todayStr)
    : activeFilter === "woche" ? allRides.slice(0, 12) : allRides;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      <View style={[styles.filterRow, { backgroundColor: colors.muted }]}>
        {(["heute", "woche", "alle"] as const).map((f) => (
          <Pressable key={f} style={[styles.filterBtn, activeFilter === f && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f)}>
            <Text style={[styles.filterText, { color: activeFilter === f ? "#fff" : colors.mutedForeground }]}>
              {f === "heute" ? "Heute" : f === "woche" ? "Woche" : "Alle"}
            </Text>
          </Pressable>
        ))}
      </View>
      {displayed.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Keine Fahrten in diesem Zeitraum</Text>
        </View>
      ) : displayed.map((ride) => (
        <View key={ride.id} style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rideTop}>
            <Text style={[styles.rideId, { color: colors.mutedForeground }]}>#{ride.id} · {ride.date} {ride.time}</Text>
            <Text style={[styles.rideAmount, { color: "#22C55E" }]}>{formatEuro(ride.amount)}</Text>
          </View>
          <View style={styles.rideRouteBlock}>
            <View style={styles.rideRouteRow}>
              <View style={[styles.rideDot, { backgroundColor: "#22C55E" }]} />
              <Text style={[styles.rideAddr, { color: colors.foreground }]} numberOfLines={1}>{ride.from}</Text>
            </View>
            <View style={[styles.rideVLine, { backgroundColor: colors.border }]} />
            <View style={styles.rideRouteRow}>
              <View style={[styles.rideDot, { backgroundColor: "#DC2626" }]} />
              <Text style={[styles.rideAddr, { color: colors.foreground }]} numberOfLines={1}>{ride.to}</Text>
            </View>
          </View>
          <View style={[styles.rideMeta, { borderTopColor: colors.border }]}>
            <View style={styles.rideMetaItem}><Feather name="map-pin" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.km.toFixed(1)} km</Text></View>
            <View style={styles.rideMetaItem}><Feather name="clock" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.duration} Min.</Text></View>
            <View style={styles.rideMetaItem}><Feather name="credit-card" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.payment}</Text></View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/* ─── Tab: Geldbeutel ─── */
function TabGeldbeutel({ allRides, driverRating }: { allRides: typeof MOCK_RIDES; driverRating: number }) {
  const colors = useColors();
  const [hidden, setHidden] = useState(false);
  const todayStr = fmt(new Date()).date;
  const todayRides = allRides.filter((r) => r.date === todayStr);
  const weekRides = allRides.slice(0, 12);
  const todayTotal = todayRides.reduce((s, r) => s + r.amount, 0);
  const weekTotal = weekRides.reduce((s, r) => s + r.amount, 0);
  const allTotal = allRides.reduce((s, r) => s + r.amount, 0);
  const allKm = allRides.reduce((s, r) => s + r.km, 0);
  const avgFare = allRides.length > 0 ? allTotal / allRides.length : 0;

  const mask = "***,** €";
  const show = (v: string) => hidden ? mask : v;

  const totalOffers = 42;
  const accepted = 38;
  const acceptanceRate = Math.round((accepted / totalOffers) * 100);
  const rejectionRate = 100 - acceptanceRate;

  const items = [
    { label: "Heute", value: show(formatEuro(todayTotal)), sub: `${todayRides.length} Fahrten`, icon: "sun" as const, color: "#F59E0B" },
    { label: "Diese Woche", value: show(formatEuro(weekTotal)), sub: `${weekRides.length} Fahrten`, icon: "calendar" as const, color: "#3B82F6" },
    { label: "Gesamt", value: show(formatEuro(allTotal)), sub: `${allRides.length} Fahrten`, icon: "trending-up" as const, color: "#22C55E" },
    { label: "Ø pro Fahrt", value: show(formatEuro(avgFare)), sub: "Durchschnitt", icon: "bar-chart-2" as const, color: "#8B5CF6" },
    { label: "Gesamt km", value: `${allKm.toFixed(0)} km`, sub: "Gefahren", icon: "map" as const, color: "#6B7280" },
    { label: "Bewertung", value: `★ ${driverRating.toFixed(1)}`, sub: "Kundenbewertung", icon: "star" as const, color: "#F59E0B" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      {/* Privacy header */}
      <View style={[styles.privacyHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.privacyTitle, { color: colors.foreground }]}>Einnahmen</Text>
          <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>Tippe auf das Auge für Datenschutz</Text>
        </View>
        <Pressable
          onPress={() => { setHidden((h) => !h); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.eyeBtn, { backgroundColor: hidden ? "#FEE2E2" : "#F3F4F6" }]}
        >
          <Feather name={hidden ? "eye-off" : "eye"} size={20} color={hidden ? "#DC2626" : "#6B7280"} />
        </Pressable>
      </View>

      {/* Earnings cards */}
      <View style={styles.earningsGrid}>
        {items.map((item) => (
          <View key={item.label} style={[styles.earnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.earnIconBg, { backgroundColor: item.color + "20" }]}>
              <Feather name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={[styles.earnValue, { color: colors.foreground }]}>{item.value}</Text>
            <Text style={[styles.earnLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            <Text style={[styles.earnSub, { color: item.color }]}>{item.sub}</Text>
          </View>
        ))}
      </View>

      {/* Performance stats */}
      <View style={[styles.perfCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.perfTitle, { color: colors.foreground }]}>Performance-Monitor</Text>
        <View style={styles.perfRow}>
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#F59E0B" }]}>★ {driverRating.toFixed(1)}</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Sterne</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#22C55E" }]}>{acceptanceRate} %</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Akzeptanzrate</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#DC2626" }]}>{rejectionRate} %</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Ablehnungsrate</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/* ─── Tab: Profil ─── */
function TabProfil({ driver, onLogout }: { driver: DriverProfile; onLogout: () => void }) {
  const colors = useColors();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.tabScroll, { paddingTop: 24 }]}>
      {/* Avatar + Name */}
      <View style={[styles.profilCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.profilAvatarWrap}>
          <View style={styles.profilAvatar}>
            <Text style={styles.profilAvatarText}>{driver.name[0]}</Text>
          </View>
          <View style={styles.profilAvatarBadge}>
            <Feather name="check" size={10} color="#fff" />
          </View>
        </View>
        <Text style={[styles.profilName, { color: colors.foreground }]}>{driver.name}</Text>
        <Text style={[styles.profilEmail, { color: colors.mutedForeground }]}>{driver.email}</Text>
        <View style={styles.profilRatingRow}>
          <Feather name="star" size={14} color="#F59E0B" />
          <Text style={[styles.profilRatingText, { color: colors.foreground }]}>{driver.rating.toFixed(1)} Sterne</Text>
        </View>
      </View>

      {/* Vehicle info */}
      <View style={[styles.profilCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.profilSectionTitle, { color: colors.mutedForeground }]}>FAHRZEUG</Text>
        <View style={styles.profilRow}>
          <View style={[styles.profilIconBg, { backgroundColor: "#F3F4F6" }]}>
            <MaterialCommunityIcons name="car" size={20} color="#374151" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profilRowLabel, { color: colors.foreground }]}>{driver.car}</Text>
            <Text style={[styles.profilRowSub, { color: colors.mutedForeground }]}>Fahrzeug</Text>
          </View>
        </View>
        <View style={[styles.profilDivider, { backgroundColor: colors.border }]} />
        <View style={styles.profilRow}>
          <View style={[styles.profilIconBg, { backgroundColor: "#F3F4F6" }]}>
            <Feather name="credit-card" size={18} color="#374151" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profilRowLabel, { color: colors.foreground }]}>{driver.plate}</Text>
            <Text style={[styles.profilRowSub, { color: colors.mutedForeground }]}>Kennzeichen</Text>
          </View>
        </View>
      </View>

      {/* Status */}
      <View style={[styles.profilCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.profilSectionTitle, { color: colors.mutedForeground }]}>KONTO</Text>
        <View style={styles.profilRow}>
          <View style={[styles.profilIconBg, { backgroundColor: "#F0FDF4" }]}>
            <Feather name="shield" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profilRowLabel, { color: colors.foreground }]}>Lizenzierter Fahrer</Text>
            <Text style={[styles.profilRowSub, { color: colors.mutedForeground }]}>Onroda Esslingen</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [styles.profilLogoutBtn, { opacity: pressed ? 0.75 : 1 }]}
        onPress={onLogout}
      >
        <Feather name="log-out" size={18} color="#DC2626" />
        <Text style={styles.profilLogoutText}>Abmelden</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ─── Active Ride Screen (with final price modal) ─── */
function ActiveRideScreen({ req, onComplete, onCancel }: { req: RideRequest; onComplete: (finalFare: number) => void; onCancel: () => void }) {
  const colors = useColors();
  const { startDriving, arriveAtCustomer, markDriverArriving } = useRideRequests();
  const [phase, setPhase] = useState<ActivePhase>(
    req.status === "in_progress" || req.status === "passenger_onboard" ? "driving" : "pickup",
  );
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [finalPriceInput, setFinalPriceInput] = useState(req.estimatedFare.toFixed(2).replace(".", ","));
  const isKK = isKrankenkasseRide(req.paymentMethod);
  const codeLine = accessCodeRideLine(req);
  const [kkEigenOpen, setKkEigenOpen] = useState(false);
  const [driverEigenanteil, setDriverEigenanteil] = useState(() =>
    req.estimatedFare.toFixed(2).replace(".", ","),
  );
  const [now, setNow] = useState(() => Date.now());
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [distanceToCustomer, setDistanceToCustomer] = useState<number | null>(null);
  const [customerLiveMarker, setCustomerLiveMarker] = useState<{ lat: number; lon: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const navAutoStarted = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDriverEigenanteil(req.estimatedFare.toFixed(2).replace(".", ","));
    setKkEigenOpen(false);
  }, [req.id, req.estimatedFare]);

  // WebSocket — connect to ride room and receive customer live GPS
  useEffect(() => {
    connectToRide(req.id, (msg) => {
      if (msg.type === "location:customer:update") {
        setCustomerLiveMarker({ lat: msg.lat as number, lon: msg.lon as number });
      }
    });
    // HTTP fallback polling for customer location
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${req.id}/customer-location`);
        if (res.ok) {
          const loc = await res.json() as { lat: number; lon: number };
          setCustomerLiveMarker({ lat: loc.lat, lon: loc.lon });
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); disconnectSocket(); };
  }, [req.id]);

  // GPS tracking — send driver position via WebSocket + HTTP every ~5s
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      // Get initial position immediately so navigation can start right away
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverCoords({ lat: initial.coords.latitude, lon: initial.coords.longitude });
      if (phase === "pickup" && req.fromLat != null && req.fromLon != null) {
        setDistanceToCustomer(haversineDistance(initial.coords.latitude, initial.coords.longitude, req.fromLat, req.fromLon));
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setDriverCoords({ lat: latitude, lon: longitude });
          if (phase === "pickup" && req.fromLat != null && req.fromLon != null) {
            setDistanceToCustomer(haversineDistance(latitude, longitude, req.fromLat, req.fromLon));
          }
          socketSendDriver(latitude, longitude);
          fetch(`${API_BASE}/rides/${req.id}/driver-location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: latitude, lon: longitude }),
          }).catch(() => {});
        },
      );
    })();
    return () => { sub?.remove(); };
  }, [phase, req.id, req.fromLat, req.fromLon]);

  // Auto-start navigation to customer as soon as GPS is available (pickup phase only)
  useEffect(() => {
    if (phase !== "pickup") return;
    if (!driverCoords || req.fromLat == null || req.fromLon == null) return;
    if (navAutoStarted.current) return;
    navAutoStarted.current = true;
    if (req.status === "accepted") {
      void markDriverArriving(req.id);
    }
    router.push({
      pathname: "/driver/navigation" as "/driver/navigation",
      params: {
        rideId: req.id,
        phase: "pickup",
        fromLat: String(driverCoords.lat),
        fromLon: String(driverCoords.lon),
        fromName: "Ihr Standort",
        toLat: String(req.fromLat),
        toLon: String(req.fromLon),
        toName: req.fromFull,
        customerName: req.customerName,
        pickupLat: String(req.fromLat),
        pickupLon: String(req.fromLon),
        pickupName: req.fromFull,
        destLat: String(req.toLat ?? req.fromLat),
        destLon: String(req.toLon ?? req.fromLon),
        destName: req.toFull ?? req.fromFull,
        estimatedFare: String(req.estimatedFare),
        paymentMethod: req.paymentMethod,
      },
    });
  }, [driverCoords, phase, req, markDriverArriving]);

  // Open in-app navigation screen manually
  // Phase "pickup": Fahrerstandort → Abholort des Kunden
  // Phase "driving": Abholort → Zieladresse
  const openNavigation = useCallback(() => {
    if (phase === "pickup") {
      if (driverCoords == null || req.fromLat == null || req.fromLon == null) {
        Alert.alert("Navigation", "GPS oder Abholkoordinaten fehlen. Bitte Ortungsdienste aktivieren oder warten, bis die Fahrt Koordinaten hat.");
        return;
      }
      const dLat = driverCoords.lat;
      const dLon = driverCoords.lon;
      if (req.status === "accepted") {
        void markDriverArriving(req.id);
      }
      const destLat = req.toLat ?? req.fromLat;
      const destLon = req.toLon ?? req.fromLon;
      router.push({
        pathname: "/driver/navigation" as "/driver/navigation",
        params: {
          rideId: req.id,
          phase: "pickup",
          fromLat: String(dLat),
          fromLon: String(dLon),
          fromName: "Ihr Standort",
          toLat: String(req.fromLat),
          toLon: String(req.fromLon),
          toName: req.fromFull,
          customerName: req.customerName,
          pickupLat: String(req.fromLat),
          pickupLon: String(req.fromLon),
          pickupName: req.fromFull,
          destLat: String(destLat),
          destLon: String(destLon),
          destName: req.toFull ?? req.fromFull,
          estimatedFare: String(req.estimatedFare),
          paymentMethod: req.paymentMethod,
        },
      });
    } else {
      if (req.fromLat == null || req.fromLon == null) {
        Alert.alert("Navigation", "Für diese Fahrt fehlen Koordinaten zum Zielbereich.");
        return;
      }
      const destLat = req.toLat ?? req.fromLat;
      const destLon = req.toLon ?? req.fromLon;
      router.push({
        pathname: "/driver/navigation" as "/driver/navigation",
        params: {
          rideId: req.id,
          phase: "driving",
          fromLat: String(req.fromLat),
          fromLon: String(req.fromLon),
          fromName: req.fromFull,
          toLat: String(destLat),
          toLon: String(destLon),
          toName: req.toFull ?? req.fromFull,
          customerName: req.customerName,
          pickupLat: String(req.fromLat),
          pickupLon: String(req.fromLon),
          pickupName: req.fromFull,
          destLat: String(destLat),
          destLon: String(destLon),
          destName: req.toFull ?? req.fromFull,
          estimatedFare: String(req.estimatedFare),
          paymentMethod: req.paymentMethod,
        },
      });
    }
  }, [phase, req, driverCoords, markDriverArriving]);

  const canStart = !req.scheduledAt || (new Date(req.scheduledAt).getTime() - now) <= 60 * 60 * 1000;
  const minutesUntilUnlock = req.scheduledAt
    ? Math.max(0, Math.ceil((new Date(req.scheduledAt).getTime() - now - 60 * 60 * 1000) / 60000))
    : 0;
  const isNearCustomer = distanceToCustomer != null && distanceToCustomer < 300;

  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const { date, time } = fmt(req.createdAt);

  const mapOrigin = phase === "pickup"
    ? { lat: driverCoords?.lat ?? 48.7394, lon: driverCoords?.lon ?? 9.3114, displayName: "Ihr Standort" }
    : { lat: req.fromLat ?? 48.6741, lon: req.fromLon ?? 9.38, displayName: req.fromFull };
  const mapDest = phase === "pickup"
    ? { lat: req.fromLat ?? 48.6741, lon: req.fromLon ?? 9.38, displayName: req.fromFull }
    : { lat: req.toLat ?? 48.69, lon: req.toLon ?? 9.2216, displayName: req.toFull };

  const handleFinishTap = () => {
    if (isKK) {
      const parsed = parseEuroDriverInput(driverEigenanteil);
      const euro = parsed ?? req.estimatedFare;
      setFinalPriceInput(euro.toFixed(2).replace(".", ","));
    } else {
      setFinalPriceInput(req.estimatedFare.toFixed(2).replace(".", ","));
    }
    setShowPriceModal(true);
  };

  const handleConfirmFare = () => {
    const parsed = parseFloat(finalPriceInput.replace(",", "."));
    const fare = isNaN(parsed) ? req.estimatedFare : parsed;
    setShowPriceModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(fare);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <RealMapView
          origin={mapOrigin}
          destination={mapDest}
          style={StyleSheet.absoluteFillObject}
          edgePaddingBottom={100}
          customerLiveMarker={phase === "pickup" ? customerLiveMarker : null}
        />
        <View style={activeStyles.headerBanner}>
          <View style={activeStyles.headerBannerInner}>
            <View style={activeStyles.headerBannerDot} />
            <Text style={activeStyles.headerBannerText}>
              {phase === "pickup" ? "Zum Kunden unterwegs" : "Fahrt läuft"}
            </Text>
          </View>
          <Text style={activeStyles.headerBannerSub}>{time} · {date}</Text>
        </View>
      </View>

      <View style={[activeStyles.sheet, { backgroundColor: colors.card }]}>
        {/* Scheduled pickup banner — only for pre-booked rides */}
        {req.scheduledAt && (() => {
          const s = fmt(new Date(req.scheduledAt!));
          return (
            <View style={activeStyles.schedInfoBanner}>
              <View style={activeStyles.schedInfoLeft}>
                <Feather name="calendar" size={18} color="#D97706" />
                <View>
                  <Text style={activeStyles.schedInfoLabel}>Vorbestellung — Abholung um</Text>
                  <Text style={activeStyles.schedInfoTime}>{s.time} Uhr · {s.date}</Text>
                </View>
              </View>
              <View style={activeStyles.schedInfoBadge}>
                <Text style={activeStyles.schedInfoBadgeText}>Termin</Text>
              </View>
            </View>
          );
        })()}

        {/* Customer row */}
        <View style={activeStyles.customerRow}>
          <View style={activeStyles.customerAvatar}>
            <Text style={activeStyles.customerAvatarText}>{req.customerName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[activeStyles.customerName, { color: colors.foreground }]}>{req.customerName}</Text>
            <Text style={[activeStyles.customerSub, { color: colors.mutedForeground }]} numberOfLines={4}>
              {codeLine ? `${codeLine}\n` : ""}
              {req.vehicle} · {isKK ? "Krankenkasse" : req.paymentMethod}
            </Text>
          </View>
          <View style={activeStyles.fareBox}>
            <Text style={activeStyles.fareLabel}>ca. Preis (brutto)</Text>
            <Text style={activeStyles.fareValue}>{formatEuro(req.estimatedFare)}</Text>
            <Text style={activeStyles.fareBruttoHint}>inkl. MwSt.</Text>
          </View>
        </View>

        {/* Route */}
        <View style={[activeStyles.routeCard, { backgroundColor: colors.muted }]}>
          <View style={activeStyles.routeRow}>
            <View style={[activeStyles.routeDot, { backgroundColor: "#22C55E" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[activeStyles.routeLabel, { color: colors.mutedForeground }]}>
                {phase === "pickup" ? "Von (Dein Standort)" : "Von (Abholpunkt)"}
              </Text>
              <Text style={[activeStyles.routeAddr, { color: colors.foreground }]} numberOfLines={1}>
                {phase === "pickup" ? "Aktueller Standort" : req.fromFull}
              </Text>
            </View>
          </View>
          <View style={[activeStyles.routeLine, { backgroundColor: colors.border }]} />
          <View style={activeStyles.routeRow}>
            <View style={[activeStyles.routeDot, { backgroundColor: "#DC2626" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[activeStyles.routeLabel, { color: colors.mutedForeground }]}>
                {phase === "pickup" ? "Bis (Abholpunkt)" : "Bis (Ziel)"}
              </Text>
              <Text style={[activeStyles.routeAddr, { color: colors.foreground }]} numberOfLines={1}>
                {phase === "pickup" ? req.fromFull : req.toFull}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={activeStyles.statsRow}>
          <View style={activeStyles.statItem}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[activeStyles.statValue, { color: colors.foreground }]}>{req.distanceKm.toFixed(1)} km</Text>
            <Text style={[activeStyles.statLabel, { color: colors.mutedForeground }]}>Strecke</Text>
          </View>
          <View style={[activeStyles.statDiv, { backgroundColor: colors.border }]} />
          {isKK ? (
            <Pressable
              style={({ pressed }) => [
                activeStyles.statItem,
                kkEigenOpen && { backgroundColor: colors.muted, borderRadius: 12 },
                pressed && { opacity: 0.92 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setKkEigenOpen((o) => !o);
              }}
              accessibilityRole="button"
              accessibilityLabel="Krankenkasse, Eigenanteil bearbeiten"
            >
              <MaterialCommunityIcons name="ticket-percent-outline" size={14} color="#2563EB" />
              <Text style={[activeStyles.statValue, { color: "#2563EB" }]}>
                {`${formatEuro(parseEuroDriverInput(driverEigenanteil) ?? req.estimatedFare)} kassieren`}
              </Text>
              <Text style={[activeStyles.statLabel, { color: "#2563EB" }]}>Krankenkasse</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#3B82F6", marginTop: 2 }}>
                {kkEigenOpen ? "Zum Schließen antippen" : "Antippen · Eigenanteil"}
              </Text>
            </Pressable>
          ) : (
            <View style={activeStyles.statItem}>
              <Feather name="credit-card" size={14} color={colors.mutedForeground} />
              <Text style={[activeStyles.statValue, { color: colors.foreground }]}>{req.paymentMethod}</Text>
              <Text style={[activeStyles.statLabel, { color: colors.mutedForeground }]}>Zahlungsart</Text>
            </View>
          )}
        </View>

        {isKK && kkEigenOpen && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Eigenanteil</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                backgroundColor: colors.muted,
              }}
            >
              <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginRight: 6 }}>€</Text>
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 18,
                  fontFamily: "Inter_700Bold",
                  color: colors.foreground,
                  paddingVertical: 10,
                }}
                value={driverEigenanteil}
                onChangeText={setDriverEigenanteil}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.mutedForeground}
                selectTextOnFocus
              />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setDriverEigenanteil("0,00");
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.muted,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Befreit (0 €)</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setDriverEigenanteil(req.estimatedFare.toFixed(2).replace(".", ","));
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.muted,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Wie gebucht</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Krankenkasse hint */}
        {isKK && (
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#93C5FD", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <MaterialCommunityIcons name="ticket-percent-outline" size={18} color="#2563EB" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#1D4ED8" }}>Krankenkassen-Fahrt</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#2563EB", marginTop: 2, lineHeight: 17 }}>
                {req.paymentMethod.includes("Befreit")
                  ? "Kunde ist befreit — nichts kassieren (0,00 €)."
                  : `Nur den Eigenanteil bei Krankenkasse kassieren. Unterlagen / Nachweis der Krankenkasse bereithalten.`}
              </Text>
            </View>
          </View>
        )}

        {/* Action button */}
        {phase === "pickup" ? (
          <>
            {req.scheduledAt && (
              <View style={{ backgroundColor: !canStart ? "#FFF7ED" : "#F0FDF4", borderRadius: 12, borderWidth: 1, borderColor: !canStart ? "#FDE68A" : "#86EFAC", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <Feather name={!canStart ? "clock" : "check-circle"} size={16} color={!canStart ? "#D97706" : "#16A34A"} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  {!canStart ? (
                    <>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#B45309" }}>Fahrt noch nicht aktivierbar</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#D97706", marginTop: 2 }}>
                        Aktivierung möglich ab 1 Std. vor Abholung (noch {minutesUntilUnlock} Min.)
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#B45309", marginTop: 6 }}>
                        Bitte rechtzeitig losfahren!
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#15803D" }}>Fahrt jetzt aktivierbar</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#16A34A", marginTop: 2 }}>
                        Bitte jetzt zum Kunden losfahren
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Navigation to pickup */}
            <Pressable style={activeStyles.navBtn} onPress={openNavigation}>
              <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
              <Text style={activeStyles.navBtnText}>Navigation starten</Text>
            </Pressable>

            {/* Angekommen — gesperrt bis < 300 m (Geofencing) */}
            <Pressable
              style={[activeStyles.binDaBtn, !isNearCustomer && { backgroundColor: "#D1D5DB" }]}
              onPress={isNearCustomer ? () => arriveAtCustomer(req.id) : undefined}
              disabled={!isNearCustomer}
            >
              <Feather name="map-pin" size={20} color={isNearCustomer ? "#fff" : "#9CA3AF"} />
              <Text style={[activeStyles.binDaBtnText, !isNearCustomer && { color: "#9CA3AF" }]}>
                {isNearCustomer
                  ? "Angekommen — Bin da!"
                  : distanceToCustomer != null
                    ? distanceToCustomer >= 1000
                      ? `${(distanceToCustomer / 1000).toFixed(1)} km bis Abholort`
                      : `${Math.round(distanceToCustomer)} m bis Abholort`
                    : "Zum Abholort fahren"}
              </Text>
            </Pressable>

            {/* Fahrt beginnen — startet + wechselt Navi auf Zieladresse */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                style={activeStyles.startDrivingBtn}
                onPress={() => {
                  startDriving(req.id);
                  setPhase("driving");
                  if (req.toLat != null && req.toLon != null) {
                    router.push({
                      pathname: "/driver/navigation" as "/driver/navigation",
                      params: {
                        rideId: req.id,
                        phase: "driving",
                        fromLat: String(req.fromLat),
                        fromLon: String(req.fromLon),
                        fromName: req.fromFull,
                        toLat: String(req.toLat),
                        toLon: String(req.toLon),
                        toName: req.toFull,
                        customerName: req.customerName,
                        pickupLat: String(req.fromLat),
                        pickupLon: String(req.fromLon),
                        pickupName: req.fromFull,
                        destLat: String(req.toLat),
                        destLon: String(req.toLon),
                        destName: req.toFull ?? req.fromFull,
                        estimatedFare: String(req.estimatedFare),
                        paymentMethod: req.paymentMethod,
                      },
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="car-arrow-right" size={22} color="#fff" />
                <Text style={activeStyles.startDrivingBtnText}>Fahrt beginnen</Text>
              </Pressable>
            </Animated.View>
          </>
        ) : (
          <>
            <Pressable style={activeStyles.navBtn} onPress={openNavigation}>
              <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
              <Text style={activeStyles.navBtnText}>Navigation zum Ziel</Text>
            </Pressable>
            <Pressable style={activeStyles.completeBtn} onPress={handleFinishTap}>
              <Feather name="flag" size={20} color="#fff" />
              <Text style={activeStyles.completeBtnText}>Zielort erreicht — Fahrt beenden</Text>
            </Pressable>
          </>
        )}

        {/* Storno */}
        <Pressable
          style={activeStyles.stornoBtn}
          onPress={() => {
            Alert.alert(
              "Auftrag abbrechen?",
              "Möchtest du diesen Auftrag wirklich stornieren?",
              [
                { text: "Nein, weiter", style: "cancel" },
                { text: "Ja, stornieren", style: "destructive", onPress: onCancel },
              ]
            );
          }}
        >
          <Feather name="x-circle" size={15} color="#DC2626" />
          <Text style={activeStyles.stornoBtnText}>Fahrt stornieren</Text>
        </Pressable>
      </View>

      {/* ─── Final price modal ─── */}
      <Modal visible={showPriceModal} transparent animationType="slide" onRequestClose={() => setShowPriceModal(false)}>
        <KeyboardAvoidingView style={activeStyles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPriceModal(false)} />
          <View style={activeStyles.priceModal}>
            <View style={activeStyles.priceModalHandle} />
            <Text style={activeStyles.priceModalTitle}>Fahrtpreis eingeben</Text>
            <Text style={activeStyles.priceModalSub}>
              Der Endpreis wird dem Kunden übermittelt
            </Text>

            {/* Route summary */}
            <View style={activeStyles.priceModalRoute}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[activeStyles.routeDotSm, { backgroundColor: "#22C55E" }]} />
                <Text style={activeStyles.priceModalRouteText} numberOfLines={1}>{req.from}</Text>
              </View>
              <View style={activeStyles.priceModalRouteLine} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[activeStyles.routeDotSm, { backgroundColor: "#DC2626" }]} />
                <Text style={activeStyles.priceModalRouteText} numberOfLines={1}>{req.to}</Text>
              </View>
            </View>

            {/* Estimated vs final */}
            <View style={activeStyles.priceRow}>
              <Text style={activeStyles.priceEstLabel}>Schätzpreis:</Text>
              <Text style={activeStyles.priceEstValue}>{formatEuro(req.estimatedFare)}</Text>
            </View>

            {/* Input */}
            <View style={activeStyles.priceInputWrapper}>
              <Text style={activeStyles.priceInputCurrency}>€</Text>
              <TextInput
                style={activeStyles.priceInput}
                value={finalPriceInput}
                onChangeText={setFinalPriceInput}
                keyboardType="decimal-pad"
                selectTextOnFocus
                autoFocus
              />
            </View>
            <Text style={activeStyles.priceInputHint}>Betrag in Euro (z.B. 63,80)</Text>

            {/* Buttons */}
            <View style={activeStyles.priceModalBtns}>
              <Pressable style={activeStyles.priceCancelBtn} onPress={() => setShowPriceModal(false)}>
                <Text style={activeStyles.priceCancelText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={activeStyles.priceConfirmBtn} onPress={handleConfirmFare}>
                <Feather name="send" size={16} color="#fff" />
                <Text style={activeStyles.priceConfirmText}>Fahrt abschließen</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ─── Main Dashboard ─── */
export default function DriverDashboard() {
  // Keep screen awake while driver app is open — never goes dark during shift
  useKeepAwake();

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { driver, logout, setAvailable, isBlocked, blockedUntilDate, blockDriver48h } = useDriver();
  const { history } = useRide();
  const {
    requests,
    pendingRequests: allPending,
    acceptedRequest,
    addRequest,
    acceptRequest,
    rejectByDriver,
    driverCancelRequest,
    cancelRequest,
    completeRequest,
  } = useRideRequests();
  const [activeTab, setActiveTab] = useState<Tab>("uebersicht");
  const [showCodeRideModal, setShowCodeRideModal] = useState(false);
  const [codeRideFrom, setCodeRideFrom] = useState("");
  const [codeRideTo, setCodeRideTo] = useState("");
  const [codeRideAccessCode, setCodeRideAccessCode] = useState("");
  const [codeRideCustomer, setCodeRideCustomer] = useState("");
  const [codeRideSubmitting, setCodeRideSubmitting] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const prevPendingIds = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);

  // In-app notification banner
  const [bannerRide, setBannerRide] = useState<RideRequest | null>(null);
  const bannerAnim = useRef(new Animated.Value(-140)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((req: RideRequest) => {
    setBannerRide(req);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    Animated.spring(bannerAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    bannerTimer.current = setTimeout(() => {
      stopRideSound().catch(() => {});
      Animated.timing(bannerAnim, { toValue: -140, useNativeDriver: true, duration: 300 }).start(() => setBannerRide(null));
    }, 8000);
  }, [bannerAnim]);

  // Request notification permissions once on mount
  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
  }, []);

  // Fire notification + vibration when a new instant ride request arrives
  useEffect(() => {
    const currentIds = new Set(allPending.map((r) => r.id));

    if (firstRender.current) {
      // On first render: silently record existing rides, no sound
      prevPendingIds.current = currentIds;
      firstRender.current = false;
      return;
    }

    const newReqs = allPending.filter(
      (r) => !r.scheduledAt && !prevPendingIds.current.has(r.id)
    );
    if (newReqs.length > 0) {
      const req = newReqs[0];
      const distKm = (driverPos && req.fromLat != null && req.fromLon != null)
        ? haversineDistance(driverPos.lat, driverPos.lon, req.fromLat, req.fromLon) / 1000
        : null;
      sendNewRideNotification({
        customerName: req.customerName,
        fromAddress: req.fromFull.split(",")[0],
        distanceKm: distKm,
        estimatedFare: req.estimatedFare,
      }).catch(() => {});
      showBanner(req);
    }
    prevPendingIds.current = currentIds;
  }, [allPending, driverPos, showBanner]);

  // GPS für Distanzanzeige auf Auftragskarten (vor Annahme)
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 50 },
        (loc) => setDriverPos({ lat: loc.coords.latitude, lon: loc.coords.longitude }),
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  /** Nur echte Fleet-Driver-ID — E-Mail als driver_id bricht API-/Statuslogik. */
  const driverId = driver?.id ?? "";

  const pendingRequests = allPending.filter(
    (r) => !(r.rejectedBy ?? []).includes(driverId)
  );
  const activeDriverRequest =
    requests.find(
      (r) =>
        (r.status === "accepted" ||
          r.status === "driver_arriving" ||
          r.status === "driver_waiting" ||
          r.status === "passenger_onboard" ||
          r.status === "arrived" ||
          r.status === "in_progress") &&
        r.driverId === driverId,
    ) ??
    (acceptedRequest && acceptedRequest.driverId === driverId ? acceptedRequest : null);

  const appRides = history.filter((r) => r.status === "completed");
  const allRides = useMemo(() => {
    const now = new Date();
    const fromApp = appRides.map((r, i) => ({
      id: `A-${i + 1}`,
      date: fmt(now).date,
      time: fmt(now).time,
      from: typeof r.origin === "string" ? r.origin.split(",")[0] : (r.origin as any)?.displayName?.split(",")[0] ?? "Start",
      to: typeof r.destination === "string" ? r.destination.split(",")[0] : (r.destination as any)?.displayName?.split(",")[0] ?? "Ziel",
      km: (r as any).route?.distanceKm ?? r.distanceKm ?? 0,
      duration: (r as any).route?.durationMinutes ?? 0,
      amount: (r as any).fareBreakdown?.total ?? r.totalFare ?? 0,
      payment:
        r.paymentMethod === "cash" ? "Bar" :
        r.paymentMethod === "paypal" ? "PayPal" :
        r.paymentMethod === "card" ? "Kreditkarte" :
        r.paymentMethod,
    }));
    return [...fromApp, ...MOCK_RIDES];
  }, [appRides]);

  const handleAccept = async (id: string) => {
    if (!driverId.trim()) {
      Alert.alert("Annahme nicht möglich", "Bitte erneut als Fahrer anmelden (keine Fahrer-ID in der Sitzung).");
      return;
    }
    try {
      stopRideSound().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await acceptRequest(id, driverId);
      setActiveTab("uebersicht");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = e instanceof Error ? e.message.trim() : "";
      const detail =
        code === "status_transition_invalid"
          ? "Für diesen Auftrag ist „Annehmen“ gerade nicht erlaubt (Status). Bitte runterziehen zum Aktualisieren oder kurz warten."
          : code
            ? `Technisch: ${code}`
            : "Der Auftrag konnte nicht angenommen werden. Bitte aktualisieren und erneut versuchen.";
      Alert.alert("Annahme fehlgeschlagen", detail);
    }
  };
  const handleReject = async (id: string) => {
    stopRideSound().catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await rejectByDriver(id, driverId);
  };
  const handleComplete = async (id: string, finalFare: number) => {
    await completeRequest(id, finalFare);
    setActiveTab("fahrten");
  };
  const handleCancel = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const req = activeDriverRequest;
    await driverCancelRequest(id, driverId);
    if (req?.scheduledAt) {
      const pickupMs = new Date(req.scheduledAt).getTime();
      const diffMin = (pickupMs - Date.now()) / 60000;
      if (diffMin >= 0 && diffMin < 60) {
        await blockDriver48h();
      }
    }
    setActiveTab("uebersicht");
  };
  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/");
  };

  const resetCodeRideForm = useCallback(() => {
    setCodeRideFrom("");
    setCodeRideTo("");
    setCodeRideAccessCode("");
    setCodeRideCustomer("");
  }, []);

  const handleCreateCodeRide = useCallback(async () => {
    const from = codeRideFrom.trim();
    const to = codeRideTo.trim();
    const accessCode = codeRideAccessCode.trim();
    if (!from || !to || !accessCode) {
      Alert.alert("Codefahrt", "Bitte Start, Ziel und Gutschein-/Freigabe-Code eingeben.");
      return;
    }
    if (!driver) return;
    setCodeRideSubmitting(true);
    try {
      await addRequest({
        from,
        fromFull: from,
        to,
        toFull: to,
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: 0,
        paymentMethod: "Code",
        vehicle: driver.car || "Taxi",
        customerName: codeRideCustomer.trim() || "Laufkunde",
        accessCode,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCodeRideModal(false);
      resetCodeRideForm();
      setActiveTab("auftraege");
      Alert.alert("Codefahrt", "Code akzeptiert. Die Fahrt wurde erstellt.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "request_failed";
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Codefahrt", accessCodeErrorMessage(code));
    } finally {
      setCodeRideSubmitting(false);
    }
  }, [addRequest, codeRideAccessCode, codeRideCustomer, codeRideFrom, codeRideTo, driver, resetCodeRideForm]);

  if (!driver) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (isBlocked && blockedUntilDate) {
    const unblockStr = blockedUntilDate.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", paddingTop: topPad, paddingHorizontal: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Feather name="slash" size={36} color="#DC2626" />
        </View>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 10 }}>
          Account gesperrt
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
          Du hast eine Vorbestellungsfahrt weniger als 60 Minuten vor der Abholzeit storniert.{"\n\n"}Dein Account ist für 48 Stunden für neue Aufträge gesperrt.
        </Text>
        <View style={{ backgroundColor: "#FEF2F2", borderRadius: 14, borderWidth: 1.5, borderColor: "#FECACA", padding: 16, width: "100%", alignItems: "center", marginBottom: 28 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#DC2626", marginBottom: 4 }}>Sperre endet am</Text>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#DC2626" }}>{unblockStr} Uhr</Text>
        </View>
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border }}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" }}>Abmelden</Text>
        </Pressable>
      </View>
    );
  }

  const sofortCount = pendingRequests.filter((r) => !r.scheduledAt).length;
  const vorbestellungCount = pendingRequests.filter((r) => !!r.scheduledAt).length;
  const totalPending = sofortCount + vorbestellungCount;

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "uebersicht", label: "Übersicht", icon: "map", badge: sofortCount > 0 ? sofortCount : undefined },
    { id: "auftraege", label: "Aufträge", icon: "radio", badge: totalPending > 0 ? totalPending : undefined },
    { id: "fahrten", label: "Meine Fahrten", icon: "list" },
    { id: "geldbeutel", label: "Geldbeutel", icon: "pocket" },
    { id: "profil", label: "Profil", icon: "user" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: "#111" }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarBg}>
              <Text style={styles.avatarText}>{driver.name[0]}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{driver.name}</Text>
              <Text style={styles.headerSub}>{driver.car} · {driver.plate}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setAvailable(!driver.isAvailable); }}
            style={[styles.availToggle, { backgroundColor: driver.isAvailable ? "#16A34A" : "#374151" }]}
          >
            <View style={[styles.availDot, { backgroundColor: driver.isAvailable ? "#4ADE80" : "#6B7280" }]} />
            <View>
              <Text style={styles.availLabel}>{driver.isAvailable ? "ONLINE" : "OFFLINE"}</Text>
              <Text style={styles.availSub}>{driver.isAvailable ? "Aufträge annehmen" : "Keine Aufträge"}</Text>
            </View>
            <Feather name={driver.isAvailable ? "toggle-right" : "toggle-left"} size={22} color={driver.isAvailable ? "#4ADE80" : "#9CA3AF"} />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeDriverRequest ? (
          <ActiveRideScreen
            req={activeDriverRequest}
            onComplete={(fare) => handleComplete(activeDriverRequest.id, fare)}
            onCancel={() => handleCancel(activeDriverRequest.id)}
          />
        ) : (
          <>
            {activeTab === "uebersicht" && <TabUebersicht pendingRequests={pendingRequests} onAccept={handleAccept} onReject={handleReject} driverPos={driverPos} isAvailable={driver.isAvailable} />}
            {activeTab === "auftraege" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                <View style={styles.ordersHeaderRow}>
                  <Text style={[styles.ordersHeaderTitle, { color: colors.foreground }]}>Offene Auftraege</Text>
                  <Pressable
                    style={styles.ordersPlusBtn}
                    onPress={() => setShowCodeRideModal(true)}
                  >
                    <Feather name="plus" size={18} color="#fff" />
                    <Text style={styles.ordersPlusText}>Code einloesen</Text>
                  </Pressable>
                </View>
                {pendingRequests.length === 0 ? (
                  <View style={styles.emptyCenter}>
                    <MaterialCommunityIcons name="taxi" size={56} color="#9CA3AF" />
                    <Text style={[styles.emptyTitle, { color: "#111" }]}>Keine Aufträge</Text>
                    <Text style={[styles.emptySub, { color: "#6B7280" }]}>Warte auf neue Anfragen...</Text>
                  </View>
                ) : (
                  <>
                    {pendingRequests.filter((r) => !r.scheduledAt).map((req) => (
                      <InstantCard key={req.id} req={req} driverPos={driverPos} onAccept={() => handleAccept(req.id)} onReject={() => handleReject(req.id)} />
                    ))}
                    {pendingRequests.filter((r) => !!r.scheduledAt).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()).map((req) => (
                      <ScheduledCard key={req.id} req={req} driverPos={driverPos} onAccept={() => handleAccept(req.id)} onReject={() => handleReject(req.id)} />
                    ))}
                  </>
                )}
              </ScrollView>
            )}
            {activeTab === "fahrten" && <TabFahrten allRides={allRides} />}
            {activeTab === "geldbeutel" && <TabGeldbeutel allRides={allRides} driverRating={driver.rating} />}
            {activeTab === "profil" && <TabProfil driver={driver} onLogout={handleLogout} />}
          </>
        )}
      </View>

      {/* ── In-App Notification Banner ── */}
      {bannerRide && (
        <Animated.View
          style={{
            position: "absolute",
            top: topPad + 70,
            left: 12,
            right: 12,
            transform: [{ translateY: bannerAnim }],
            zIndex: 9999,
            backgroundColor: "#1C1C1E",
            borderRadius: 16,
            padding: 16,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            borderWidth: 1.5,
            borderColor: "#DC2626",
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" }}>
            <MaterialCommunityIcons name="taxi" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
              Neuer Auftrag
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (bannerTimer.current) clearTimeout(bannerTimer.current);
              stopRideSound().catch(() => {});
              Animated.timing(bannerAnim, { toValue: -140, useNativeDriver: true, duration: 200 }).start(() => setBannerRide(null));
            }}
            hitSlop={12}
          >
            <Feather name="x" size={20} color="#9CA3AF" />
          </Pressable>
        </Animated.View>
      )}

      {/* Bottom Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable key={tab.id} style={styles.tabBtn}
              onPress={() => { setActiveTab(tab.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
              <View style={styles.tabIconWrap}>
                <Feather name={tab.icon as any} size={22} color={active ? "#DC2626" : colors.mutedForeground} />
                {tab.badge && tab.badge > 0 ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{tab.badge}</Text></View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, { color: active ? "#DC2626" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                {tab.label}
              </Text>
              {active && <View style={styles.tabActiveBar} />}
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={showCodeRideModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (codeRideSubmitting) return;
          setShowCodeRideModal(false);
          resetCodeRideForm();
        }}
      >
        <KeyboardAvoidingView style={activeStyles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (codeRideSubmitting) return;
              setShowCodeRideModal(false);
              resetCodeRideForm();
            }}
          />
          <View style={activeStyles.priceModal}>
            <View style={activeStyles.priceModalHandle} />
            <Text style={activeStyles.priceModalTitle}>Codefahrt anlegen</Text>
            <Text style={activeStyles.priceModalSub}>
              Fuer Laufkunden mit Gutschein- oder Freigabe-Code.
            </Text>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Start</Text>
              <TextInput
                style={styles.codeRideInput}
                value={codeRideFrom}
                onChangeText={setCodeRideFrom}
                placeholder="z. B. Bahnhof Esslingen"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Ziel</Text>
              <TextInput
                style={styles.codeRideInput}
                value={codeRideTo}
                onChangeText={setCodeRideTo}
                placeholder="z. B. Klinik Stuttgart"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Gutschein-/Freigabe-Code</Text>
              <TextInput
                style={styles.codeRideInput}
                value={codeRideAccessCode}
                onChangeText={setCodeRideAccessCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="z. B. HOTEL-STUTTGART-2026"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Kundenname (optional)</Text>
              <TextInput
                style={styles.codeRideInput}
                value={codeRideCustomer}
                onChangeText={setCodeRideCustomer}
                placeholder="Laufkunde"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={activeStyles.priceModalBtns}>
              <Pressable
                style={activeStyles.priceCancelBtn}
                onPress={() => {
                  if (codeRideSubmitting) return;
                  setShowCodeRideModal(false);
                  resetCodeRideForm();
                }}
              >
                <Text style={activeStyles.priceCancelText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={activeStyles.priceConfirmBtn}
                onPress={() => {
                  void handleCreateCodeRide();
                }}
                disabled={codeRideSubmitting}
              >
                {codeRideSubmitting ? (
                  <Text style={activeStyles.priceConfirmText}>Erstelle...</Text>
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={activeStyles.priceConfirmText}>Fahrt erstellen</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  availToggle: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  availSub: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  logoutBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },

  tabBar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 6 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 6, gap: 3, position: "relative" },
  tabIconWrap: { position: "relative" },
  tabLabel: { fontSize: 10 },
  tabActiveBar: { position: "absolute", bottom: -6, left: "20%", right: "20%", height: 2, backgroundColor: "#DC2626", borderRadius: 1 },
  badge: { position: "absolute", top: -5, right: -8, backgroundColor: "#DC2626", borderRadius: 8, minWidth: 16, height: 16, justifyContent: "center", alignItems: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },

  tabScroll: { padding: 16, gap: 14, paddingBottom: 32 },
  emptyCenter: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ordersHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ordersHeaderTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ordersPlusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#2563EB",
  },
  ordersPlusText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  codeRideField: { gap: 6 },
  codeRideLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#374151" },
  codeRideInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },

  /* Instant card */
  reqCard: {
    backgroundColor: "#fff", borderRadius: 20, borderWidth: 2, borderColor: "#22C55E",
    overflow: "hidden",
    shadowColor: "#22C55E", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  reqCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F0FDF4", paddingHorizontal: 16, paddingVertical: 12 },
  reqTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqNewLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#15803D" },
  reqDateTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7280" },
  reqPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  reqPriceLabel: { fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
  reqPrice: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#111" },
  reqBadges: { gap: 5, alignItems: "flex-end" },
  reqBadge: { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reqBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  reqRoute: { paddingHorizontal: 16, paddingBottom: 12, gap: 2 },
  reqRouteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reqRouteLine: { width: 2, height: 18, backgroundColor: "#E5E7EB", marginLeft: 5, marginVertical: 2 },
  dotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#22C55E", marginTop: 4 },
  dotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#DC2626", marginTop: 4 },
  reqRouteLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 },
  reqRouteAddr: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#111", marginTop: 1 },
  reqMeta: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  reqMetaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  metaSep: { width: 1, height: 12, backgroundColor: "#E5E7EB", marginHorizontal: 4 },
  reqActions: { flexDirection: "row", gap: 10, padding: 14 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  rejectText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  acceptBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 14, backgroundColor: "#22C55E" },
  acceptBtnLocked: { backgroundColor: "#9CA3AF" },
  acceptText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", flexShrink: 1 },

  /* Scheduled card extras */
  reqCardScheduled: { borderColor: "#F59E0B", shadowColor: "#F59E0B" },
  schedPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  schedPillText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  schedTimeBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: "#FFFBEB" },
  schedTimeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  schedTimeValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#92400E" },
  schedDateValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 4 },
  schedRoute: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12, gap: 2 },
  schedRouteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  schedStats: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  schedStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  schedStatText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#6B7280" },
  schedStatDivider: { width: 1, height: 14, backgroundColor: "#E5E7EB" },

  /* Übersicht map tab */
  mapStatusChip: {
    position: "absolute", top: 16, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  mapStatusDot: { width: 9, height: 9, borderRadius: 5 },
  mapStatusText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  mapReqOverlay: {
    position: "absolute", bottom: 12, left: 12, right: 12,
  },
  mapMoreReqs: {
    textAlign: "center", marginTop: 8,
    fontSize: 13, fontFamily: "Inter_500Medium", color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12,
    paddingVertical: 5, paddingHorizontal: 12, alignSelf: "center",
  },

  /* Map tab (old) */
  mapTabContainer: { flex: 1 },
  mapOverlay: { position: "absolute", bottom: 16, left: 16, right: 16 },
  mapCard: { backgroundColor: "#fff", borderRadius: 20, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  mapCardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  mapCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#15803D" },
  mapCardAddr: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#111", marginBottom: 12 },
  mapCardDivider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 12 },
  mapCardStats: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  mapStatItem: { alignItems: "center", gap: 2 },
  mapStatValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111" },
  mapStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  mapStatDivider: { width: 1, height: 28, backgroundColor: "#E5E7EB" },

  /* Fahrten tab */
  filterRow: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4, marginBottom: 4 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  filterBtnActive: { backgroundColor: "#111" },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rideCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  rideTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rideId: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rideAmount: { fontSize: 17, fontFamily: "Inter_700Bold" },
  rideRouteBlock: { gap: 3 },
  rideRouteRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  rideDot: { width: 8, height: 8, borderRadius: 4 },
  rideVLine: { width: 2, height: 14, marginLeft: 3 },
  rideAddr: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  rideMeta: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  rideMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  rideMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  /* Einnahmen / Geldbeutel tab */
  earningsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  earnCard: { width: "47%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  earnIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  earnValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  earnLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  earnSub: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },

  /* Privacy / eye */
  privacyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 4 },
  privacyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  privacySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eyeBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },

  /* Performance stats */
  perfCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, marginTop: 4 },
  perfTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  perfRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  perfItem: { alignItems: "center", gap: 4, flex: 1 },
  perfDivider: { width: 1, height: 36 },
  perfValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  perfLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  /* Profil tab */
  profilCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 0, marginBottom: 12, alignItems: "center" },
  profilAvatarWrap: { position: "relative", marginBottom: 12 },
  profilAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" },
  profilAvatarText: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff" },
  profilAvatarBadge: { position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: "#22C55E", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  profilName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  profilEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  profilRatingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profilRatingText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  profilSectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, alignSelf: "flex-start" },
  profilRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", paddingVertical: 4 },
  profilIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  profilRowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  profilRowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  profilDivider: { height: 1, marginVertical: 8, width: "100%" },
  profilLogoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 15, borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2", marginTop: 4 },
  profilLogoutText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#DC2626" },
});

const activeStyles = StyleSheet.create({
  headerBanner: {
    position: "absolute", top: 12, left: 12, right: 12,
    backgroundColor: "rgba(17,17,17,0.88)", borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerBannerInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E" },
  headerBannerText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  headerBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },

  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16 },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  customerAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" },
  customerAvatarText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  customerName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  customerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  fareBox: { alignItems: "flex-end" },
  fareLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#9CA3AF", textTransform: "uppercase" },
  fareValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#22C55E" },
  fareBruttoHint: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#16A34A" },

  routeCard: { borderRadius: 14, padding: 14, gap: 4 },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLine: { width: 2, height: 16, marginLeft: 4, marginVertical: 2 },
  routeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  routeAddr: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },

  statsRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 4 },
  statItem: { alignItems: "center", gap: 3 },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1, height: 32 },

  schedInfoBanner: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: "#FDE68A",
  },
  schedInfoLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  schedInfoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5 },
  schedInfoTime: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#92400E", marginTop: 2 },
  schedInfoBadge: { backgroundColor: "#F59E0B", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  schedInfoBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },

  stornoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  stornoBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#DC2626" },

  pickupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#22C55E", borderRadius: 16, paddingVertical: 16 },
  pickupBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  navBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#2563EB", borderRadius: 16, paddingVertical: 14, marginBottom: 8 },
  navBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  binDaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#22C55E", borderRadius: 16, paddingVertical: 16 },
  binDaBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  startDrivingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#16A34A", borderRadius: 16, paddingVertical: 16 },
  startDrivingBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  completeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#DC2626", borderRadius: 16, paddingVertical: 16 },
  completeBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Price modal */
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  priceModal: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.15, shadowRadius: 20,
  },
  priceModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 4 },
  priceModalTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111", textAlign: "center" },
  priceModalSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center", marginTop: -8 },
  priceModalRoute: { backgroundColor: "#F9FAFB", borderRadius: 14, padding: 14, gap: 6 },
  priceModalRouteLine: { width: 2, height: 16, backgroundColor: "#E5E7EB", marginLeft: 5 },
  priceModalRouteText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", flex: 1 },
  routeDotSm: { width: 10, height: 10, borderRadius: 5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  priceEstLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  priceEstValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#9CA3AF" },
  priceInputWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 2, borderColor: "#22C55E", borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 14, gap: 8,
    backgroundColor: "#F0FDF4",
  },
  priceInputCurrency: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#15803D" },
  priceInput: { flex: 1, fontSize: 36, fontFamily: "Inter_700Bold", color: "#111" },
  priceInputHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", textAlign: "center", marginTop: -8 },
  priceModalBtns: { flexDirection: "row", gap: 12 },
  priceCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB" },
  priceCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  priceConfirmBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: "#22C55E" },
  priceConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
