import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RealMapView } from "@/components/RealMapView";
import { HOME_SHEET_BG, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { usePartner } from "@/context/PartnerContext";
import { partnerFetchTracking, type PartnerTrackingSnapshot } from "@/utils/partnerApi";
import {
  connectPartnerRideSocket,
  disconnectPartnerRideSocket,
} from "@/utils/partnerRideSocket";
import {
  isPartnerDriverArrived,
  isPartnerTrackingTerminal,
} from "@/utils/partnerRideTracking";
import {
  isPartnerSearchTimeout,
  partnerRideStatusHumanLabel,
  partnerRideStatusVisual,
} from "@/utils/partnerRides";

const PARTNER_GREEN = "#15803D";
const POLL_MS = 4000;

export default function PartnerTrackScreen() {
  const insets = useSafeAreaInsets();
  const { token, booting, handleUnauthorized } = usePartner();
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const id = typeof rideId === "string" ? rideId : "";

  const [snapshot, setSnapshot] = useState<PartnerTrackingSnapshot | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusNowMs, setStatusNowMs] = useState(() => Date.now());
  const arrivedHandledRef = useRef(false);

  const finishArrived = useCallback(() => {
    if (arrivedHandledRef.current) return;
    arrivedHandledRef.current = true;
    disconnectPartnerRideSocket();
    Alert.alert("Fahrer ist da", "Das Taxi wartet an der Abholadresse.", [
      {
        text: "OK",
        onPress: () => router.replace("/partner/home"),
      },
    ]);
  }, []);

  const applySnapshot = useCallback(
    (data: PartnerTrackingSnapshot) => {
      setSnapshot(data);
      const loc = data.driver?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
        setDriverPos({ lat: loc.lat, lon: loc.lon });
      }
      if (isPartnerDriverArrived(data.ride.status)) {
        finishArrived();
        return;
      }
      if (isPartnerTrackingTerminal(data.ride.status)) {
        disconnectPartnerRideSocket();
        router.replace("/partner/home");
      }
    },
    [finishArrived],
  );

  const poll = useCallback(async () => {
    if (!token || !id) return;
    const r = await partnerFetchTracking(token, id);
    if (!r.ok) {
      if (r.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
        return;
      }
      if (r.forbidden) {
        disconnectPartnerRideSocket();
        Alert.alert("Kein Zugriff", r.message, [
          { text: "OK", onPress: () => router.replace("/partner/home") },
        ]);
        return;
      }
      setLoading(false);
      return;
    }
    applySnapshot(r.data);
    setLoading(false);
  }, [token, id, applySnapshot, handleUnauthorized]);

  useEffect(() => {
    if (!booting && !token) {
      router.replace("/partner/login");
    }
  }, [booting, token]);

  useEffect(() => {
    if (!token || !id) return undefined;

    connectPartnerRideSocket(
      id,
      token,
      (msg) => {
        const type = typeof msg.type === "string" ? msg.type : "";
        if (type === "location:driver:update") {
          const lat = msg.lat;
          const lon = msg.lon;
          if (typeof lat === "number" && typeof lon === "number") {
            setDriverPos({ lat, lon });
          }
        }
      },
      (code) => {
        if (code === "join_auth_invalid") {
          void handleUnauthorized().then(() => router.replace("/partner/login"));
          return;
        }
        if (code === "join_forbidden") {
          disconnectPartnerRideSocket();
          Alert.alert("Kein Zugriff", "Diese Fahrt gehört nicht zu Ihrem Unternehmen.", [
            { text: "OK", onPress: () => router.replace("/partner/home") },
          ]);
          return;
        }
        void poll();
      },
    );

    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearInterval(t);
      disconnectPartnerRideSocket();
    };
  }, [token, id, poll, handleUnauthorized]);

  useEffect(() => {
    const ride = snapshot?.ride;
    if (!ride) return;
    const statusRide = { status: ride.status, createdAt: ride.createdAt };
    const active =
      ["pending", "requested", "searching_driver", "offered", "ready_for_dispatch"].includes(ride.status)
      && !isPartnerSearchTimeout(statusRide, Date.now());
    if (!active) return;
    const tick = () => setStatusNowMs(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [snapshot?.ride?.status, snapshot?.ride?.createdAt]);

  const ride = snapshot?.ride;
  const driver = snapshot?.driver;
  const pickup =
    ride?.fromLat != null && ride?.fromLon != null
      ? {
          lat: ride.fromLat,
          lon: ride.fromLon,
          displayName: ride.pickupLabel?.trim() || "Abholung",
        }
      : null;
  const statusRide = ride ? { status: ride.status, createdAt: ride.createdAt } : null;
  const statusVisual = statusRide ? partnerRideStatusVisual(statusRide, statusNowMs) : null;
  const showTimeout = statusRide ? isPartnerSearchTimeout(statusRide, statusNowMs) : false;

  const statusLineText = showTimeout
    ? "Momentan kein Fahrer verfügbar"
    : statusRide
      ? partnerRideStatusHumanLabel(statusRide, statusNowMs)
      : "—";

  return (
    <View style={[styles.root, { backgroundColor: HOME_SHEET_BG }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.replace("/partner/home")} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#111" />
        </Pressable>
        <Text style={styles.topTitle}>Fahrerstatus</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.mapWrap}>
        {pickup ? (
          <RealMapView
            style={StyleSheet.absoluteFill}
            origin={pickup}
            driverMarker={driverPos}
            edgePaddingTop={insets.top + 72}
            edgePaddingBottom={200}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color={PARTNER_GREEN} />
          </View>
        )}
      </View>

      <View style={[styles.bottomSheet, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, paddingBottom: insets.bottom + 16 }]}>
        {loading ? (
          <ActivityIndicator color={PARTNER_GREEN} />
        ) : (
          <>
            <View style={[styles.statusPill, { backgroundColor: statusVisual?.bg ?? "rgba(107,114,128,0.12)" }]}>
              {statusVisual?.loading ? (
                <MaterialCommunityIcons name="taxi" size={16} color={statusVisual.accent} />
              ) : showTimeout ? (
                <Feather name="alert-circle" size={15} color={statusVisual?.accent ?? "#D97706"} />
              ) : null}
              <Text style={[styles.statusLine, { color: statusVisual?.text ?? "#374151" }]}>{statusLineText}</Text>
            </View>
            <View style={styles.driverRow}>
              <MaterialCommunityIcons name="taxi" size={18} color={PARTNER_GREEN} />
              <Text style={styles.driverText}>
                {driver?.name?.trim() || "Fahrer wird zugewiesen…"}
              </Text>
            </View>
            <View style={styles.driverRow}>
              <MaterialCommunityIcons name="taxi" size={18} color="#6B7280" />
              <Text style={styles.driverText}>
                Kennzeichen: {driver?.plate?.trim() || "folgt"}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111" },
  mapWrap: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  bottomSheet: {
    marginTop: 12,
    marginHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  statusLine: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  driverText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#111", flex: 1 },
});
