import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PartnerOrderSheet } from "@/components/partner/PartnerOrderSheet";
import { PartnerRideCard } from "@/components/partner/PartnerRideCard";
import { LiveSearchResultGroup } from "@/components/booking/LiveSearchResultGroup";
import { LiveSearchRouteCard } from "@/components/booking/LiveSearchRouteCard";
import { HOME_SHEET_BG, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { usePartner } from "@/context/PartnerContext";
import { loginActionButtonStyle, loginActionLabelStyle, LOGIN_ACTION_ICON_SIZE } from "@/src/screens/LoginScreen";
import {
  createPartnerTaxiRide,
  resolvePartnerPickupFromGps,
  type PartnerRoutePlace,
} from "@/utils/partnerInstantBooking";
import {
  geoLocationToPartnerRoutePlace,
  validatePartnerRoutePlace,
} from "@/utils/partnerRoutePlace";
import { searchLocation, type GeoLocation } from "@/utils/routing";
import {
  partnerCancelRide,
  partnerFetchRides,
  partnerFetchTracking,
  partnerHideRide,
  type PartnerRideRow,
} from "@/utils/partnerApi";
import {
  computePartnerHomeStats,
  filterPartnerVisibleRides,
  isPartnerRideActive,
  isPartnerRideOpen,
  isPartnerSearchTimeout,
  partnerRideNeedsCancelReason,
  isPartnerRideReservation,
  PARTNER_MAX_OPEN_RIDES,
  sortPartnerRidesNewestFirst,
} from "@/utils/partnerRides";

const PARTNER_GREEN = "#15803D";
/** Gleiche Breite links/rechts → Firmenname bleibt optisch mittig, unabhängig von Logo/Badge. */
const PARTNER_HEADER_SIDE_W = 124;
const PARTNER_HEADER_H = 52;
const PARTNER_ICON_BG = "#DCFCE7";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: FeatherIconName;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.statMainRow}>
        <View style={styles.iconCircle}>
          <Feather name={icon} size={14} color={PARTNER_GREEN} />
        </View>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function RideListSectionHeader({
  title,
  icon,
  style,
}: {
  title: string;
  icon: FeatherIconName;
  style?: object;
}) {
  return (
    <View style={[styles.subsectionRow, style]}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={14} color={PARTNER_GREEN} />
      </View>
      <Text style={styles.subsectionTitle}>{title}</Text>
    </View>
  );
}

export default function PartnerHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, booting, logout, handleUnauthorized, unreadMessageCount } = usePartner();
  const [fromPlace, setFromPlace] = useState<PartnerRoutePlace | null>(null);
  const [toPlace, setToPlace] = useState<PartnerRoutePlace | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [isEditingOrigin, setIsEditingOrigin] = useState(true);
  const [originResults, setOriginResults] = useState<GeoLocation[]>([]);
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchUserGps, setSearchUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const originInputRef = useRef<TextInput | null>(null);
  const destInputRef = useRef<TextInput | null>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rides, setRides] = useState<PartnerRideRow[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [cancelRide, setCancelRide] = useState<PartnerRideRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [trackingInfoByRideId, setTrackingInfoByRideId] = useState<
    Record<string, { driverName?: string | null; plate?: string | null; etaLabel?: string }>
  >({});
  const [statusNowMs, setStatusNowMs] = useState(() => Date.now());
  const logoutInFlightRef = useRef(false);
  const dismissedRideIdsRef = useRef(new Set<string>());
  const loadRidesSeqRef = useRef(0);

  const toUiRideList = useCallback((list: PartnerRideRow[]) => {
    return filterPartnerVisibleRides(list).filter((r) => !dismissedRideIdsRef.current.has(r.id));
  }, []);

  const refreshGpsStart = useCallback(async () => {
    setGpsLoading(true);
    const result = await resolvePartnerPickupFromGps();
    setGpsLoading(false);
    if (!result.ok) {
      Alert.alert("Standort", result.message);
      return;
    }
    setSearchUserGps({ lat: result.place.lat, lon: result.place.lon });
    setFromPlace(result.place);
    setOriginQuery(result.place.label);
    setOriginResults([]);
    setIsEditingOrigin(false);
    setTimeout(() => destInputRef.current?.focus(), 100);
  }, []);

  const handleOriginQueryChange = useCallback(
    (text: string) => {
      setOriginQuery(text);
      if (fromPlace) setFromPlace(null);
      if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
      if (text.length < 2) {
        setOriginResults([]);
        setIsSearchingOrigin(false);
        return;
      }
      setIsSearchingOrigin(true);
      originDebounceRef.current = setTimeout(async () => {
        try {
          const locs = await searchLocation(text, searchUserGps ?? undefined);
          setOriginResults(locs.slice(0, 5));
        } catch {
          setOriginResults([]);
        } finally {
          setIsSearchingOrigin(false);
        }
      }, 300);
    },
    [fromPlace, searchUserGps],
  );

  const handleDestQueryChange = useCallback(
    (text: string) => {
      setDestQuery(text);
      if (toPlace) setToPlace(null);
      if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
      if (text.length < 2) {
        setDestResults([]);
        setIsSearchingDest(false);
        return;
      }
      setIsSearchingDest(true);
      destDebounceRef.current = setTimeout(async () => {
        try {
          const locs = await searchLocation(text, searchUserGps ?? undefined);
          setDestResults(locs.slice(0, 6));
        } catch {
          setDestResults([]);
        } finally {
          setIsSearchingDest(false);
        }
      }, 300);
    },
    [searchUserGps, toPlace],
  );

  const pickFromLive = useCallback((loc: GeoLocation) => {
    const place = geoLocationToPartnerRoutePlace(loc);
    const check = validatePartnerRoutePlace(place, "from");
    if (!check.ok) {
      Alert.alert("Adresse unvollständig", check.message);
      return;
    }
    setFromPlace(place);
    setOriginQuery(place.label);
    setOriginResults([]);
    setIsEditingOrigin(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => destInputRef.current?.focus(), 100);
  }, []);

  const pickToLive = useCallback((loc: GeoLocation) => {
    const place = geoLocationToPartnerRoutePlace(loc);
    const check = validatePartnerRoutePlace(place, "to");
    if (!check.ok) {
      Alert.alert("Adresse unvollständig", check.message);
      return;
    }
    setToPlace(place);
    setDestQuery(place.label);
    setDestResults([]);
    setIsEditingOrigin(false);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const clearDestQuery = useCallback(() => {
    setDestQuery("");
    setDestResults([]);
    setToPlace(null);
  }, []);

  const refreshAcceptedTrackingInfo = useCallback(
    async (ridesInput: PartnerRideRow[]) => {
      if (!token) return;
      const accepted = ridesInput.filter((r) => r.status === "accepted" && isPartnerRideOpen(r.status));
      if (accepted.length === 0) {
        setTrackingInfoByRideId({});
        return;
      }
      const rows = await Promise.all(
        accepted.map(async (ride) => {
          const t = await partnerFetchTracking(token, ride.id);
          if (!t.ok) return [ride.id, null] as const;
          const driver = t.data.driver;
          let etaLabel = "wird berechnet";
          if (
            driver?.location
            && t.data.ride.fromLat != null
            && t.data.ride.fromLon != null
            && Number.isFinite(driver.location.lat)
            && Number.isFinite(driver.location.lon)
          ) {
            const km = approxDistanceKm(driver.location.lat, driver.location.lon, t.data.ride.fromLat, t.data.ride.fromLon);
            etaLabel = `ca. ${Math.max(1, Math.round((km / 30) * 60))} Min`;
          }
          return [
            ride.id,
            {
              driverName: driver?.name ?? null,
              plate: driver?.plate ?? null,
              etaLabel,
            },
          ] as const;
        }),
      );
      const next: Record<string, { driverName?: string | null; plate?: string | null; etaLabel?: string }> = {};
      for (const [rideId, info] of rows) {
        if (info) next[rideId] = info;
      }
      setTrackingInfoByRideId(next);
    },
    [token],
  );

  const loadRides = useCallback(async () => {
    if (!token) return;
    const seq = ++loadRidesSeqRef.current;
    setLoadingRides(true);
    const r = await partnerFetchRides(token);
    if (seq !== loadRidesSeqRef.current) {
      console.log("[PartnerHome] loadRides stale skip", { seq, current: loadRidesSeqRef.current });
      setLoadingRides(false);
      return;
    }
    setLoadingRides(false);
    if (!r.ok) {
      if (r.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
      }
      return;
    }
    const visible = toUiRideList(r.data);
    console.log("[PartnerHome] loadRides count raw/visible", r.data.length, visible.length);
    setRides(visible);
    void refreshAcceptedTrackingInfo(visible);
  }, [token, handleUnauthorized, refreshAcceptedTrackingInfo, toUiRideList]);

  useFocusEffect(
    useCallback(() => {
      if (!booting && !token) {
        router.replace("/partner/login");
        return;
      }
      if (token) {
        void loadRides();
      }
    }, [booting, token, loadRides]),
  );

  useEffect(() => {
    return () => {
      if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
      if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    };
  }, []);

  const visibleRides = useMemo(() => toUiRideList(rides), [rides, toUiRideList]);

  const hasLiveSearchRides = useMemo(
    () =>
      visibleRides.some((r) =>
        ["pending", "requested", "searching_driver", "offered", "ready_for_dispatch"].includes(r.status),
      ),
    [visibleRides],
  );

  useEffect(() => {
    if (!hasLiveSearchRides) return;
    const tick = () => setStatusNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasLiveSearchRides]);

  const stats = useMemo(() => {
    const base = computePartnerHomeStats(visibleRides, statusNowMs);
    const openWithoutTimeout = visibleRides.filter(
      (r) => isPartnerRideOpen(r.status) && !isPartnerSearchTimeout(r, statusNowMs),
    ).length;
    return { ...base, openCount: openWithoutTimeout };
  }, [visibleRides, statusNowMs]);

  const activeRides = useMemo(
    () => visibleRides.filter((r) => isPartnerRideActive(r, statusNowMs)).sort(sortPartnerRidesNewestFirst),
    [visibleRides, statusNowMs],
  );
  const timeoutRides = useMemo(
    () => visibleRides.filter((r) => isPartnerSearchTimeout(r, statusNowMs)).sort(sortPartnerRidesNewestFirst),
    [visibleRides, statusNowMs],
  );
  const reservationRides = useMemo(
    () => visibleRides.filter((r) => isPartnerRideReservation(r, statusNowMs)).sort(sortPartnerRidesNewestFirst),
    [visibleRides, statusNowMs],
  );

  const atOpenLimit = stats.openCount >= PARTNER_MAX_OPEN_RIDES;
  const hasTimeoutRide = useMemo(
    () => visibleRides.some((r) => isPartnerSearchTimeout(r, statusNowMs)),
    [visibleRides, statusNowMs],
  );

  const handleLogout = async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    await logout();
    logoutInFlightRef.current = false;
    router.replace("/");
  };

  const routeReady = Boolean(fromPlace && toPlace);
  const showOriginResults = isEditingOrigin && (originResults.length > 0 || isSearchingOrigin);
  const showDestResults = !isEditingOrigin && destResults.length > 0;

  const handleOpenOrder = () => {
    if (!fromPlace || !toPlace || atOpenLimit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOrderSheetOpen(true);
  };

  const handleConfirmOrder = async (mode: "now" | "reservation", note: string, scheduledAt: string | null) => {
    if (!token || !user || !fromPlace || !toPlace) return;
    setOrdering(true);
    const result = await createPartnerTaxiRide(token, user, fromPlace, toPlace, { mode, note, scheduledAt });
    setOrdering(false);
    if (!result.ok) {
      if (result.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
        return;
      }
      Alert.alert("Buchung fehlgeschlagen", result.message);
      if (!result.limitReached) return;
      setOrderSheetOpen(false);
      void loadRides();
      return;
    }
    setOrderSheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadRides();
  };

  const submitCancel = async () => {
    if (!token || !cancelRide) return;
    setCancelling(true);
    const r = await partnerCancelRide(token, cancelRide.id, cancelReason);
    setCancelling(false);
    if (!r.ok) {
      if (r.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
        return;
      }
      Alert.alert("Storno fehlgeschlagen", r.message);
      return;
    }
    setCancelRide(null);
    setCancelReason("");
    await loadRides();
  };

  const removeRideFromList = async (ride: PartnerRideRow) => {
    console.log("[PartnerHome] hide request", ride.id);
    if (!token) {
      console.log("[PartnerHome] hide aborted — no token");
      return;
    }
    const r = await partnerHideRide(token, ride.id);
    if (!r.ok) {
      if (r.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
        return;
      }
      Alert.alert("Aktion fehlgeschlagen", r.message || "Fahrt konnte nicht aus der Liste entfernt werden.");
      return;
    }
    dismissedRideIdsRef.current.add(ride.id);
    loadRidesSeqRef.current += 1;
    setRides((prev) => {
      const before = prev.length;
      const next = prev.filter((r) => r.id !== ride.id);
      console.log("[PartnerHome] hide local remove", ride.id);
      console.log("[PartnerHome] rides before/after count", before, next.length);
      return next;
    });
    await loadRides();
  };

  const companyLabel = user?.companyName?.trim() || user?.username?.trim() || "Ihr Unternehmen";

  if (booting) {
    return (
      <View style={[styles.centered, { backgroundColor: HOME_SHEET_BG }]}>
        <ActivityIndicator color={PARTNER_GREEN} />
        <Text style={styles.bootText}>Partner-Bereich wird geladen…</Text>
      </View>
    );
  }

  if (!user || !token) {
    return (
      <View style={[styles.centered, { backgroundColor: HOME_SHEET_BG }]}>
        <ActivityIndicator color={PARTNER_GREEN} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: HOME_SHEET_BG, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={[styles.headerSlot, styles.headerSlotLeft]}>
          <Image
            source={require("../../assets/images/onroda-logo-transparent.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.headerSlot, styles.headerSlotRight]}>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.inboxBtn}
              onPress={() => router.push("/partner/messages")}
              accessibilityLabel="Posteingang"
            >
              <Feather name="bell" size={22} color="#111" />
              {unreadMessageCount > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {unreadMessageCount > 99 ? "99+" : String(unreadMessageCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={styles.logoutBtn} onPress={() => void handleLogout()} accessibilityLabel="Abmelden">
              <Feather name="log-out" size={22} color="#EF1D26" />
            </Pressable>
          </View>
        </View>
        <View style={styles.headerCenterOverlay} pointerEvents="none">
          <Text style={styles.companyName} numberOfLines={2}>
            {companyLabel}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.routeBlock}>
          <LiveSearchRouteCard
            isEditingOrigin={isEditingOrigin}
            originQuery={originQuery}
            destQuery={destQuery}
            onOriginQueryChange={handleOriginQueryChange}
            onDestQueryChange={handleDestQueryChange}
            onFocusOrigin={() => setIsEditingOrigin(true)}
            onFocusDest={() => setIsEditingOrigin(false)}
            originInputRef={originInputRef}
            destInputRef={destInputRef}
            gpsLoading={gpsLoading}
            onGpsPress={() => void refreshGpsStart()}
            isSearchingDest={isSearchingDest}
            onClearDest={clearDestQuery}
          />
          {showOriginResults ? (
            <LiveSearchResultGroup
              locations={originResults}
              loading={isSearchingOrigin}
              onPick={pickFromLive}
            />
          ) : null}
          {showDestResults ? (
            <LiveSearchResultGroup
              locations={destResults}
              isDestination
              onPick={pickToLive}
            />
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <StatTile label="Aktive Fahrten" value={String(stats.activeCount)} icon="activity" />
          <StatTile label="Geplante Fahrten" value={String(stats.plannedCount)} icon="calendar" />
          <StatTile label="Abgeschlossen heute" value={String(stats.completedToday)} icon="check-circle" />
          <StatTile
            label="Offene Fahrten"
            value={`${stats.openCount} / ${PARTNER_MAX_OPEN_RIDES}`}
            icon="layers"
          />
        </View>

        {atOpenLimit ? (
          <Text style={styles.limitBanner}>Maximal 5 offene Fahrten gleichzeitig erreicht.</Text>
        ) : null}
        {hasTimeoutRide ? (
          <Text style={styles.limitBanner}>Momentan kein Fahrer verfügbar</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Meine Fahrten</Text>
        {loadingRides ? (
          <ActivityIndicator color={PARTNER_GREEN} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.rideSections}>
            <View>
              <RideListSectionHeader title="Aktive Fahrt" icon="activity" />
              {activeRides.length === 0 ? (
                <Text style={styles.emptyHint}>Keine aktive Fahrt.</Text>
              ) : (
                activeRides.map((ride) => (
                  <PartnerRideCard
                    key={ride.id}
                    ride={ride}
                    nowMs={statusNowMs}
                    acceptedInfo={trackingInfoByRideId[ride.id]}
                    onDetails={(id) => router.push({ pathname: "/partner/track", params: { rideId: id } })}
                    onCancel={setCancelRide}
                    onRemoveFromList={(r) => void removeRideFromList(r)}
                  />
                ))
              )}
            </View>

            <View>
              <RideListSectionHeader title="Reservierungen" icon="calendar" />
              {reservationRides.length === 0 ? (
                <Text style={styles.emptyHint}>Keine Reservierungen.</Text>
              ) : (
                reservationRides.map((ride) => (
                  <PartnerRideCard
                    key={ride.id}
                    ride={ride}
                    nowMs={statusNowMs}
                    acceptedInfo={trackingInfoByRideId[ride.id]}
                    onDetails={(id) => router.push({ pathname: "/partner/track", params: { rideId: id } })}
                    onCancel={setCancelRide}
                    onRemoveFromList={(r) => void removeRideFromList(r)}
                  />
                ))
              )}
            </View>

            <View>
              <RideListSectionHeader title="Nicht vermittelt" icon="alert-circle" />
              {timeoutRides.length === 0 ? (
                <Text style={styles.emptyHint}>Keine Timeout-Fahrten.</Text>
              ) : (
                timeoutRides.map((ride) => (
                  <PartnerRideCard
                    key={ride.id}
                    ride={ride}
                    nowMs={statusNowMs}
                    acceptedInfo={trackingInfoByRideId[ride.id]}
                    onDetails={(id) => router.push({ pathname: "/partner/track", params: { rideId: id } })}
                    onCancel={setCancelRide}
                    onRemoveFromList={(r) => void removeRideFromList(r)}
                  />
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: HOME_SHEET_BG }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={({ pressed }) =>
            loginActionButtonStyle({
              backgroundColor: PARTNER_GREEN,
              paddingVertical: 18,
              borderRadius: 14,
              opacity: pressed || !routeReady || atOpenLimit ? 0.85 : 1,
            })
          }
          onPress={handleOpenOrder}
          disabled={!routeReady || atOpenLimit}
        >
          <Feather name="navigation" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
          <Text style={loginActionLabelStyle({ color: "#fff" })}>Taxi bestellen</Text>
        </Pressable>
      </View>

      <PartnerOrderSheet
        visible={orderSheetOpen}
        fromLabel={fromPlace?.full ?? ""}
        toLabel={toPlace?.full ?? ""}
        submitting={ordering}
        onClose={() => setOrderSheetOpen(false)}
        onConfirm={(mode, note, scheduledAt) => void handleConfirmOrder(mode, note, scheduledAt)}
      />

      <Modal visible={cancelRide != null} transparent animationType="fade" onRequestClose={() => setCancelRide(null)}>
        <View style={styles.cancelBackdrop}>
          <View style={[styles.cancelCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
            <Text style={styles.cancelTitle}>Fahrt wirklich stornieren?</Text>
            {cancelRide && partnerRideNeedsCancelReason(cancelRide.status) ? (
              <>
                <Text style={styles.cancelSub}>Grund (optional)</Text>
                <TextInput
                  style={[styles.cancelInput, { borderColor: HOME_SHEET_RIM }]}
                  value={cancelReason}
                  onChangeText={(t) => setCancelReason(t.slice(0, 200))}
                  placeholder="z. B. Gast abgereist"
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </>
            ) : null}
            <View style={styles.cancelActions}>
              <Pressable style={styles.cancelBackBtn} onPress={() => setCancelRide(null)} disabled={cancelling}>
                <Text style={styles.cancelBackText}>Zurück</Text>
              </Pressable>
              <Pressable style={styles.cancelConfirmBtn} onPress={() => void submitCancel()} disabled={cancelling}>
                {cancelling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.cancelConfirmText}>Stornieren</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  bootText: { marginTop: 8, fontSize: 14, fontFamily: "Inter_500Medium", color: "#6B7280" },
  header: {
    position: "relative",
    height: PARTNER_HEADER_H,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  headerSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: PARTNER_HEADER_SIDE_W,
    justifyContent: "center",
  },
  headerSlotLeft: {
    left: -6,
    alignItems: "flex-start",
  },
  headerSlotRight: {
    right: 0,
    alignItems: "flex-end",
  },
  logo: { width: 124, height: 46, marginLeft: -2 },
  headerCenterOverlay: {
    position: "absolute",
    left: PARTNER_HEADER_SIDE_W,
    right: PARTNER_HEADER_SIDE_W,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  companyName: {
    width: "100%",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
    textAlign: "center",
    lineHeight: 26,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  inboxBtn: { width: 40, height: PARTNER_HEADER_H, alignItems: "center", justifyContent: "center" },
  inboxBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF1D26",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  inboxBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  logoutBtn: { width: 40, height: PARTNER_HEADER_H, alignItems: "center", justifyContent: "center" },
  routeBlock: { marginBottom: 18, gap: 8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  statTile: {
    width: "48%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 9,
    minWidth: "46%",
    gap: 4,
  },
  statMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PARTNER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statValue: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: PARTNER_GREEN,
    lineHeight: 22,
  },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#6B7280", lineHeight: 14 },
  rideSections: { gap: 14 },
  subsectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  limitBanner: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#B45309",
    marginBottom: 12,
    textAlign: "center",
  },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111", marginBottom: 8 },
  subsectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111", flex: 1 },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginBottom: 8 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HOME_SHEET_RIM,
  },
  cancelBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  cancelCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  cancelTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111", marginBottom: 12 },
  cancelSub: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#6B7280", marginBottom: 8 },
  cancelInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111",
    textAlignVertical: "top",
  },
  cancelActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBackBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    alignItems: "center",
  },
  cancelBackText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#374151" },
  cancelConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#EF1D26",
    alignItems: "center",
  },
  cancelConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});

function approxDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
