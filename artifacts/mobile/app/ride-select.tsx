import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { VEHICLES, useRide } from "@/context/RideContext";
import { useColors } from "@/hooks/useColors";
import { pickTariffForStartAddress } from "@/lib/appConfig";
import { appTariffFromRecord, calculateFareFromAppConfig, ceilToTenth, formatEuro } from "@/utils/fareCalculator";

const CAR_ICON_COLOR = "#171717";
const WHEELCHAIR_ICON_COLOR = "#0369A1";

export default function RideSelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { config: appCfg } = useOnrodaAppConfig();
  const mapRef = useRef<MapView>(null);
  const {
    origin,
    destination,
    selectedVehicle,
    setSelectedVehicle,
    route,
    isLoadingRoute,
    routeError,
    fetchRoute,
    setScheduledTime,
  } = useRide();

  useEffect(() => {
    if (!destination) return;
    if (!selectedVehicle) setSelectedVehicle("standard");
    void fetchRoute();
  }, [destination, selectedVehicle, setSelectedVehicle, fetchRoute]);

  const vehiclePrices = useMemo(() => {
    const km = route?.distanceKm ?? 0;
    if (!km) return new Map<string, string>();
    const tRaw = pickTariffForStartAddress(appCfg, origin.displayName ?? "");
    const tcfg = appTariffFromRecord(tRaw);
    const baseTaxi = calculateFareFromAppConfig(km, 0, tcfg).total;
    return new Map(
      VEHICLES.map((v) => {
        const total = ceilToTenth(baseTaxi * v.multiplier);
        return [v.id, formatEuro(total)];
      }),
    );
  }, [route?.distanceKm, appCfg, origin.displayName]);

  if (!destination) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: "#FFFFFF" }]}>
        <Text style={[styles.emptyText, { color: colors.foreground }]}>
          Bitte zuerst ein Ziel wählen.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/")}>
          <Text style={styles.primaryBtnText}>Zur Startseite</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#FFFFFF", paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Wähle deine Fahrt</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.routePreview, { borderColor: colors.border, backgroundColor: "#FFFFFF" }]}>
          <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>Strecken-Vorschau</Text>
          <View style={styles.routeMapWrap}>
            {Platform.OS === "web" ? (
              <View style={styles.routeMapFallback}>
                <Text style={styles.routeMapFallbackText}>Start → Ziel</Text>
              </View>
            ) : (
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_GOOGLE}
                onMapReady={() => {
                  mapRef.current?.fitToCoordinates(
                    [
                      { latitude: origin.lat, longitude: origin.lon },
                      { latitude: destination.lat, longitude: destination.lon },
                    ],
                    {
                      edgePadding: { top: 36, right: 36, bottom: 36, left: 36 },
                      animated: true,
                    },
                  );
                }}
                initialRegion={{
                  latitude: origin.lat,
                  longitude: origin.lon,
                  latitudeDelta: 0.06,
                  longitudeDelta: 0.06,
                }}
              >
                <Marker coordinate={{ latitude: origin.lat, longitude: origin.lon }} pinColor="#22C55E" />
                <Marker coordinate={{ latitude: destination.lat, longitude: destination.lon }} pinColor="#DC2626" />
                {(route?.polyline ?? []).length > 1 ? (
                  <Polyline
                    coordinates={(route?.polyline ?? []).map(([lat, lon]) => ({ latitude: lat, longitude: lon }))}
                    strokeColor={ONRODA_MARK_RED}
                    strokeWidth={4}
                  />
                ) : null}
              </MapView>
            )}
          </View>
          <Text style={[styles.routeLine, { color: colors.foreground }]} numberOfLines={1}>
            {origin.displayName}
          </Text>
          <Text style={[styles.routeLine, { color: colors.foreground }]} numberOfLines={1}>
            {destination.displayName}
          </Text>
        </View>

        <View style={[styles.vehiclesCard, { borderColor: colors.border, backgroundColor: "#FFFFFF" }]}>
          {VEHICLES.map((v) => {
            const active = selectedVehicle === v.id;
            const price = vehiclePrices.get(v.id);
            return (
              <Pressable
                key={v.id}
                style={[
                  styles.vehicleRow,
                  {
                    borderColor: active ? ONRODA_MARK_RED : colors.border,
                    backgroundColor: active ? `${ONRODA_MARK_RED}12` : colors.background,
                  },
                ]}
                onPress={() => setSelectedVehicle(v.id)}
              >
                <View style={styles.vehicleLeft}>
                  <MaterialCommunityIcons
                    name={v.icon as any}
                    size={22}
                    color={v.id === "wheelchair" ? WHEELCHAIR_ICON_COLOR : CAR_ICON_COLOR}
                  />
                  <Text style={[styles.vehicleName, { color: active ? ONRODA_MARK_RED : colors.foreground }]}>
                    {v.id === "standard" ? "Standard Taxi" : v.name}
                  </Text>
                </View>
                <Text style={[styles.vehiclePrice, { color: colors.foreground }]}>
                  {price ?? "—"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoadingRoute ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={ONRODA_MARK_RED} />
            <Text style={{ color: colors.mutedForeground }}>Preis wird berechnet…</Text>
          </View>
        ) : routeError ? (
          <Text style={{ color: colors.destructive }}>{routeError}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          style={styles.confirmBtn}
          onPress={() => {
            setScheduledTime(null);
            router.push("/ride");
          }}
        >
          <Text style={styles.confirmBtnText}>Abholung bestätigen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14, paddingBottom: 20 },
  routePreview: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  routeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  routeMapWrap: { height: 130, borderRadius: 12, overflow: "hidden" },
  routeMapFallback: { flex: 1, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  routeMapFallbackText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827" },
  routeLine: { fontSize: 13, fontFamily: "Inter_500Medium" },
  vehiclesCard: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 8 },
  vehicleRow: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vehicleLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  vehicleName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  vehiclePrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
  confirmBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  confirmBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  primaryBtn: { backgroundColor: ONRODA_MARK_RED, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold" },
});
