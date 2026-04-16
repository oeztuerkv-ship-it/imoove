import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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

import {
  DEFAULT_ORIGIN,
  VEHICLES,
  type VehicleType,
  type VehicleOption,
  useRide,
} from "@/context/RideContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { formatEuro } from "@/utils/fareCalculator";
import { type GeoLocation, searchLocation } from "@/utils/routing";

const GROUP_RADIUS = 10;
const WHEEL_ITEM = 44;
const WHEEL_VISIBLE = 5;
const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

type Step = "where" | "extras" | "when" | "review";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function buildScheduledDate(dayOffset: number, hour: number, minuteIndex: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minuteIndex * 5, 0, 0);
  return d;
}

function shortPlace(displayName: string) {
  const p = displayName.split(",");
  return (p[0] ?? displayName).trim() || "—";
}

/** Stadt für Anzeige „neben“ der Adresszeile (Context/Photon). */
function cityFromLoc(loc: GeoLocation): string | null {
  const c = loc.city?.trim();
  if (c) return c;
  const parts = loc.displayName.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0].toLowerCase();
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const low = seg.toLowerCase();
    if (low === first) continue;
    if (low.includes("deutschland") || low === "germany") continue;
    return seg;
  }
  return null;
}

function AddressRoutePanel({
  origin,
  destination,
  colors,
}: {
  origin: GeoLocation;
  destination: GeoLocation | null;
  colors: ReturnType<typeof useColors>;
}) {
  const originCity = cityFromLoc(origin);
  const destCity = destination ? cityFromLoc(destination) : null;
  const originLine = shortPlace(origin.displayName);
  const destLine = destination ? shortPlace(destination.displayName) : "—";

  return (
    <View style={[styles.addressRoutePanel, { backgroundColor: colors.background, borderColor: colors.primary + "33" }]}>
      <Text style={[styles.addressRouteLabel, { color: colors.mutedForeground }]}>Abholung</Text>
      <View style={styles.addressRouteLineRow}>
        <Text style={[styles.addressRouteValue, styles.addressRouteLineMain, { color: colors.foreground }]} numberOfLines={5}>
          {originLine}
        </Text>
        {originCity && originCity.toLowerCase() !== originLine.toLowerCase() ? (
          <Text style={[styles.addressRouteCity, { color: colors.mutedForeground }]} numberOfLines={2}>
            {originCity}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.addressRouteLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Ziel</Text>
      <View style={styles.addressRouteLineRow}>
        <Text style={[styles.addressRouteValue, styles.addressRouteLineMain, { color: colors.foreground }]} numberOfLines={5}>
          {destLine}
        </Text>
        {destination && destCity && destCity.toLowerCase() !== destLine.toLowerCase() ? (
          <Text style={[styles.addressRouteCity, { color: colors.mutedForeground }]} numberOfLines={2}>
            {destCity}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function TimeWheel({
  labels,
  selectedIndex,
  onSelectIndex,
  wheelKey,
}: {
  labels: string[];
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  wheelKey: number;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const didInitScroll = useRef(false);
  const fade = colors.background;

  useEffect(() => {
    didInitScroll.current = false;
  }, [wheelKey]);

  useEffect(() => {
    if (didInitScroll.current) return;
    didInitScroll.current = true;
    const y = selectedIndex * WHEEL_ITEM;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
  }, [selectedIndex, wheelKey]);

  const onScrollEnd = useCallback(
    (y: number) => {
      const i = Math.round(y / WHEEL_ITEM);
      const clamped = Math.max(0, Math.min(labels.length - 1, i));
      if (clamped !== selectedIndex) {
        Haptics.selectionAsync();
        onSelectIndex(clamped);
      }
    },
    [labels.length, onSelectIndex, selectedIndex],
  );

  return (
    <View style={styles.wheelWrap} key={wheelKey}>
      <LinearGradient
        pointerEvents="none"
        colors={[fade, "transparent"]}
        style={styles.wheelFadeTop}
      />
      <ScrollView
        ref={scrollRef}
        style={{ height: WHEEL_ITEM * WHEEL_VISIBLE }}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM * ((WHEEL_VISIBLE - 1) / 2) }}
        snapToInterval={WHEEL_ITEM}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(e) => onScrollEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => onScrollEnd(e.nativeEvent.contentOffset.y)}
      >
        {labels.map((label, i) => {
          const active = i === selectedIndex;
          return (
            <View key={i} style={styles.wheelItem}>
              <Text
                style={[
                  styles.wheelLabelBase,
                  { color: active ? colors.primary : colors.mutedForeground },
                  active && styles.wheelLabelActiveSize,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", fade]}
        style={styles.wheelFadeBottom}
      />
      <View
        pointerEvents="none"
        style={[
          styles.wheelSelectionBar,
          { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0D" },
        ]}
      />
    </View>
  );
}

export default function ReserveRideScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const colors = useColors();

  const params = useLocalSearchParams<{ skipWhere?: string; scheduleMode?: string }>();
  const skipWhere = params.skipWhere === "1";
  const scheduleMode: "immediate" | "scheduled" =
    params.scheduleMode === "scheduled" ? "scheduled" : "immediate";

  const {
    setScheduledTime,
    scheduledTime,
    destination,
    setDestination,
    setOrigin,
    origin,
    fareBreakdown,
    selectedVehicle,
    setSelectedVehicle,
    setIsExempted,
    setPaymentMethod,
    fetchRoute,
    isLoadingRoute,
    routeError,
    resetRide,
  } = useRide();

  const [step, setStep] = useState<Step>("where");
  const [savedHome, setSavedHome] = useState<GeoLocation | null>(null);
  const [savedWork, setSavedWork] = useState<GeoLocation | null>(null);
  const [pickupResolved, setPickupResolved] = useState<GeoLocation | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickupResults, setPickupResults] = useState<GeoLocation[]>([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [destLoading, setDestLoading] = useState(false);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(0);
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [wheelKey, setWheelKey] = useState(0);

  const [driverNote, setDriverNote] = useState("");
  /** Nur bei Fahrzeug „Rollstuhl“: Ja/Nein zum Transportschein (null = noch nicht gewählt). */
  const [transportschein, setTransportschein] = useState<boolean | null>(null);
  const [luggage, setLuggage] = useState<"none" | "one" | "several">("none");
  const [noteModal, setNoteModal] = useState(false);
  const [luggageModal, setLuggageModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const rideRef = useRef({ origin, destination });
  rideRef.current = { origin, destination };

  /** Nach Tap auf einen Vorschlag: nächster pickupQuery-Effekt-Lauf soll keine neue Suche starten (sonst öffnet die Liste sofort wieder). */
  const skipNextPickupSearchRef = useRef(false);
  const skipNextDestSearchRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem("@Onroda_home")
      .then((raw) => {
        if (raw) setSavedHome(JSON.parse(raw));
      })
      .catch(() => {});
    AsyncStorage.getItem("@Onroda_work")
      .then((raw) => {
        if (raw) setSavedWork(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  /* Einmalig pro Screen-Mount: Start entweder bei Route (Home) oder bei Adresswahl. */
  const didSeedWhereStepRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didSeedWhereStepRef.current) return;
      didSeedWhereStepRef.current = true;
      const { origin: o, destination: d } = rideRef.current;
      if (skipWhere) {
        setPickupQuery(shortPlace(o.displayName));
        setPickupResolved(o);
        if (d) {
          setDestQuery(shortPlace(d.displayName));
        } else {
          setDestQuery("");
        }
        setPickupResults([]);
        setDestResults([]);
        skipNextPickupSearchRef.current = true;
        skipNextDestSearchRef.current = true;
        setSelectedVehicle(null);
        setPaymentMethod(null);
        setIsExempted(false);
        setStep("extras");
        if (scheduleMode === "immediate") {
          setScheduledTime(null);
        }
        return;
      }
      setPickupQuery(shortPlace(o.displayName));
      setPickupResolved(o);
      if (d) {
        setDestQuery(shortPlace(d.displayName));
      } else {
        setDestQuery("");
      }
      setPickupResults([]);
      setDestResults([]);
      skipNextPickupSearchRef.current = true;
      skipNextDestSearchRef.current = true;
    }, [skipWhere, scheduleMode, setIsExempted, setPaymentMethod, setScheduledTime, setSelectedVehicle]),
  );

  useEffect(() => {
    return () => {
      didSeedWhereStepRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pickupResolved) setOrigin(pickupResolved);
  }, [pickupResolved, setOrigin]);

  useEffect(() => {
    if (skipNextPickupSearchRef.current) {
      skipNextPickupSearchRef.current = false;
      if (pickupDebounceRef.current) {
        clearTimeout(pickupDebounceRef.current);
        pickupDebounceRef.current = null;
      }
      setPickupLoading(false);
      return;
    }
    if (pickupQuery.length < 2) {
      setPickupResults([]);
      return;
    }
    if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    const biasLoc = rideRef.current.destination;
    const bias = biasLoc ? { lat: biasLoc.lat, lon: biasLoc.lon } : undefined;
    const q = pickupQuery;
    pickupDebounceRef.current = setTimeout(async () => {
      setPickupLoading(true);
      try {
        const locs = await searchLocation(q, bias);
        setPickupResults(locs);
      } catch {
        setPickupResults([]);
      } finally {
        setPickupLoading(false);
      }
    }, 320);
    return () => {
      if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    };
  }, [pickupQuery]);

  useEffect(() => {
    if (skipNextDestSearchRef.current) {
      skipNextDestSearchRef.current = false;
      if (destDebounceRef.current) {
        clearTimeout(destDebounceRef.current);
        destDebounceRef.current = null;
      }
      setDestLoading(false);
      return;
    }
    if (destQuery.length < 2) {
      setDestResults([]);
      return;
    }
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    const q = destQuery;
    const biasSource = pickupResolved ?? rideRef.current.origin;
    const bias = biasSource ? { lat: biasSource.lat, lon: biasSource.lon } : { lat: origin.lat, lon: origin.lon };
    destDebounceRef.current = setTimeout(async () => {
      setDestLoading(true);
      try {
        const locs = await searchLocation(q, bias);
        setDestResults(locs);
      } catch {
        setDestResults([]);
      } finally {
        setDestLoading(false);
      }
    }, 320);
    return () => {
      if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    };
  }, [destQuery, pickupResolved, origin.lat, origin.lon]);

  useEffect(() => {
    if (step === "review" && destination && selectedVehicle) {
      void fetchRoute();
    }
  }, [step, destination, selectedVehicle, fetchRoute]);

  const hourLabels = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i)), []);
  const minuteLabels = useMemo(
    () => Array.from({ length: 12 }, (_, i) => pad2(i * 5)),
    [],
  );

  const dayChips = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label =
        i === 0 ? "Heute" : i === 1 ? "Morgen" : `${DAY_NAMES[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
      return { offset: i, label, sub: `${MONTHS[d.getMonth()]} ${d.getDate()}` };
    });
  }, []);

  const pickedDate = useMemo(
    () => buildScheduledDate(dayOffset, hour, minuteIndex),
    [dayOffset, hour, minuteIndex],
  );

  const luggageLabel =
    luggage === "none" ? "Kein Koffer" : luggage === "one" ? "1 Koffer" : "Mehrere";

  const vehicleLabel =
    selectedVehicle != null ? (VEHICLES.find((v) => v.id === selectedVehicle)?.name ?? "—") : "—";

  const commitSchedule = useCallback(() => {
    const d = buildScheduledDate(dayOffset, hour, minuteIndex);
    setScheduledTime(d);
    return d;
  }, [dayOffset, hour, minuteIndex, setScheduledTime]);

  const clearPickupTime = useCallback(() => {
    Haptics.selectionAsync();
    setScheduledTime(null);
    setHour(0);
    setMinuteIndex(0);
    setDayOffset(0);
    setWheelKey((k) => k + 1);
  }, [setScheduledTime]);

  const canProceedWhere = pickupResolved != null && destination != null;

  const pickPickup = useCallback(
    (loc: GeoLocation) => {
      if (pickupDebounceRef.current) {
        clearTimeout(pickupDebounceRef.current);
        pickupDebounceRef.current = null;
      }
      skipNextPickupSearchRef.current = true;
      setPickupResolved(loc);
      setPickupQuery(shortPlace(loc.displayName));
      setPickupResults([]);
      setOrigin(loc);
      Keyboard.dismiss();
      Haptics.selectionAsync();
    },
    [setOrigin],
  );

  const pickDestination = useCallback(
    (loc: GeoLocation) => {
      if (destDebounceRef.current) {
        clearTimeout(destDebounceRef.current);
        destDebounceRef.current = null;
      }
      skipNextDestSearchRef.current = true;
      setDestination(loc);
      setDestQuery(shortPlace(loc.displayName));
      setDestResults([]);
      Keyboard.dismiss();
      Haptics.selectionAsync();
    },
    [setDestination],
  );

  const clearPickup = useCallback(() => {
    Keyboard.dismiss();
    setPickupResolved(null);
    setPickupQuery("");
    setPickupResults([]);
    setOrigin(DEFAULT_ORIGIN);
    Haptics.selectionAsync();
  }, [setOrigin]);

  const clearDestination = useCallback(() => {
    Keyboard.dismiss();
    setDestination(null);
    setDestQuery("");
    setDestResults([]);
    Haptics.selectionAsync();
  }, [setDestination]);
  const wheelchairNeedsTransportschein =
    selectedVehicle === "wheelchair" && transportschein === null;
  const canProceedExtras =
    pickupResolved != null &&
    selectedVehicle != null &&
    destination != null &&
    !wheelchairNeedsTransportschein;
  const canProceedWhen = true;

  const goNext = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === "where") {
      if (!canProceedWhere) return;
      setStep("extras");
      return;
    }
    if (step === "extras") {
      if (!canProceedExtras) return;
      if (skipWhere && scheduleMode === "immediate") {
        setScheduledTime(null);
        await fetchRoute();
        setStep("review");
        return;
      }
      await fetchRoute();
      setStep("when");
      return;
    }
    if (step === "when") {
      if (!canProceedWhen) return;
      commitSchedule();
      await fetchRoute();
      setStep("review");
    }
  }, [
    step,
    canProceedWhere,
    canProceedExtras,
    canProceedWhen,
    commitSchedule,
    fetchRoute,
    skipWhere,
    scheduleMode,
    setScheduledTime,
  ]);

  const handleBook = useCallback(() => {
    if (!pickupResolved || !destination || !selectedVehicle) {
      Alert.alert("Unvollständig", "Bitte Abholung, Ziel und Fahrzeug prüfen.");
      return;
    }
    if (isLoadingRoute || !fareBreakdown) {
      Alert.alert("Bitte warten", "Der Preis wird noch berechnet.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (skipWhere && scheduleMode === "immediate") {
      setScheduledTime(null);
    } else {
      commitSchedule();
    }
    router.push("/ride");
  }, [
    pickupResolved,
    destination,
    selectedVehicle,
    isLoadingRoute,
    fareBreakdown,
    commitSchedule,
    skipWhere,
    scheduleMode,
    setScheduledTime,
  ]);

  const arrowDisabled =
    step === "where"
      ? !canProceedWhere
      : step === "extras"
        ? !canProceedExtras
        : step === "review"
          ? isLoadingRoute || !fareBreakdown
          : false;

  const footerPrimaryDisabled =
    step === "where"
      ? !canProceedWhere
      : step === "extras"
        ? !canProceedExtras
        : step === "review"
          ? isLoadingRoute || !fareBreakdown
          : false;

  const footerPrimaryLabel =
    step === "review"
      ? isLoadingRoute
        ? "Preis wird berechnet…"
        : "Planung bestätigen"
      : "Weiter";

  const reviewCtaGreen = step === "review" && !footerPrimaryDisabled && !isLoadingRoute;

  const stepProgress = useMemo(() => {
    if (skipWhere) {
      if (scheduleMode === "immediate") {
        if (step === "extras") return { current: 1, total: 2 };
        if (step === "review") return { current: 2, total: 2 };
        return { current: 1, total: 2 };
      }
      if (step === "extras") return { current: 1, total: 3 };
      if (step === "when") return { current: 2, total: 3 };
      if (step === "review") return { current: 3, total: 3 };
      return { current: 1, total: 3 };
    }
    if (step === "where") return { current: 1, total: 4 };
    if (step === "extras") return { current: 2, total: 4 };
    if (step === "when") return { current: 3, total: 4 };
    return { current: 4, total: 4 };
  }, [step, skipWhere, scheduleMode]);

  /** Schritt 1: Nach Listenauswahl nur noch festen Text, kein TextInput. */
  const pickupLocked = pickupResolved != null;
  const destLocked = destination != null;
  const whereBothLockedReady = pickupLocked && destLocked;

  const handleCancelReservation = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetRide();
    setOrigin(DEFAULT_ORIGIN);
    setPaymentMethod(null);
    setIsExempted(false);
    setStep("where");
    setPickupResolved(null);
    setPickupQuery("");
    setPickupResults([]);
    setDestQuery("");
    setDestResults([]);
    setDriverNote("");
    setTransportschein(null);
    setLuggage("none");
    setDayOffset(0);
    setHour(0);
    setMinuteIndex(0);
    setWheelKey((k) => k + 1);
    router.back();
  }, [resetRide, setOrigin, setIsExempted, setPaymentMethod]);

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={12} onPress={handleCancelReservation} style={styles.headerSide}>
          <Text style={[styles.headerAbbrechen, { color: colors.primary }]}>Abbrechen</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.primary }]} numberOfLines={2}>
            Fahrt buchen
          </Text>
          <Text style={[styles.headerStep, { color: colors.foreground }]}>
            Schritt {stepProgress.current} von {stepProgress.total}
          </Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => {
            if (arrowDisabled) return;
            if (step === "review") handleBook();
            else void goNext();
          }}
          style={styles.headerSideRight}
        >
          <Feather name="arrow-right" size={24} color={arrowDisabled ? colors.border : colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "where" ? (
          <>
            <View style={[styles.whereStepPanel, { backgroundColor: colors.background, borderColor: colors.primary + "2B" }]}>
              <Text style={[styles.addressRouteLabel, { color: colors.mutedForeground }]}>Abholung</Text>
              {pickupLocked && pickupResolved ? (
                <View style={styles.whereLockedRow}>
                  <Feather name="navigation" size={18} color={colors.primary} style={styles.whereEditIcon} />
                  <Text style={[styles.whereLockedText, { color: colors.foreground }]} numberOfLines={6}>
                    {pickupResolved.displayName}
                  </Text>
                  <Pressable
                    hitSlop={10}
                    onPress={clearPickup}
                    style={styles.whereClearBtn}
                    accessibilityLabel="Abholadresse ändern"
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.whereEditRow}>
                    <Feather name="navigation" size={18} color={colors.primary} style={styles.whereEditIcon} />
                    <TextInput
                      style={[styles.whereInput, { color: colors.foreground }]}
                      value={pickupQuery}
                      onChangeText={(t) => {
                        setPickupQuery(t);
                      }}
                      placeholder="Abholort suchen …"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    {(pickupQuery.length > 0 || pickupResolved != null) && (
                      <Pressable
                        hitSlop={10}
                        onPress={clearPickup}
                        style={styles.whereClearBtn}
                        accessibilityLabel="Abholadresse löschen"
                      >
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                    {pickupLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                  {!pickupLocked && pickupResults.length > 0 ? (
                    <View style={styles.whereSuggestions}>
                      {pickupResults.map((loc, i) => (
                        <Pressable
                          key={`pu-${loc.lat}-${loc.lon}-${i}`}
                          style={[styles.whereSuggestionRow, { backgroundColor: colors.background }]}
                          onPress={() => pickPickup(loc)}
                        >
                          <Feather name="map-pin" size={16} color={colors.primary} />
                          <Text style={[styles.whereSuggestionText, { color: colors.foreground }]} numberOfLines={2}>
                            {loc.displayName}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              )}

              {/* Favoriten: Zuhause / Arbeit auch im Reservieren-Flow */}
              <View style={styles.whereFavouritesRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.whereFavouriteChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: "#FFF7ED",
                      opacity: pressed ? 0.94 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (savedHome) {
                      pickPickup(savedHome);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }}
                >
                  <MaterialCommunityIcons name="star-four-points" size={14} color="#F59E0B" />
                  <Text style={[styles.whereFavouriteText, { color: colors.foreground }]}>Zuhause</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.whereFavouriteChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: "#EFF6FF",
                      opacity: pressed ? 0.94 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (savedWork) {
                      pickPickup(savedWork);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }}
                >
                  <MaterialCommunityIcons name="star-four-points" size={14} color="#F59E0B" />
                  <Text style={[styles.whereFavouriteText, { color: colors.foreground }]}>Arbeit</Text>
                </Pressable>
              </View>

              <Text style={[styles.addressRouteLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Ziel</Text>
              {destLocked && destination ? (
                <View style={styles.whereLockedRow}>
                  <Feather name="map-pin" size={18} color={colors.primary} style={styles.whereEditIcon} />
                  <Text style={[styles.whereLockedText, { color: colors.foreground }]} numberOfLines={6}>
                    {destination.displayName}
                  </Text>
                  <Pressable
                    hitSlop={10}
                    onPress={clearDestination}
                    style={styles.whereClearBtn}
                    accessibilityLabel="Zieladresse ändern"
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.whereEditRow}>
                    <Feather name="map-pin" size={18} color={colors.primary} style={styles.whereEditIcon} />
                    <TextInput
                      style={[styles.whereInput, { color: colors.foreground }]}
                      value={destQuery}
                      onChangeText={(t) => {
                        setDestQuery(t);
                      }}
                      placeholder="Ziel suchen …"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    {(destQuery.length > 0 || destination != null) && (
                      <Pressable
                        hitSlop={10}
                        onPress={clearDestination}
                        style={styles.whereClearBtn}
                        accessibilityLabel="Zieladresse löschen"
                      >
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                    {destLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                  {!destLocked && destResults.length > 0 ? (
                    <View style={styles.whereSuggestions}>
                      {destResults.map((loc, i) => (
                        <Pressable
                          key={`de-${loc.lat}-${loc.lon}-${i}`}
                          style={[styles.whereSuggestionRow, { backgroundColor: colors.background }]}
                          onPress={() => pickDestination(loc)}
                        >
                          <Feather name="map-pin" size={16} color={colors.primary} />
                          <Text style={[styles.whereSuggestionText, { color: colors.foreground }]} numberOfLines={2}>
                            {loc.displayName}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </View>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
              {whereBothLockedReady
                ? "Beide Orte sind festgelegt. Tippen Sie auf „Weiter“, um fortzufahren."
                : "Wählen Sie Abholort und Ziel aus der Liste. Nach der Auswahl wird das Feld gesperrt (nur noch Text)."}
            </Text>
          </>
        ) : (
          <AddressRoutePanel origin={origin} destination={destination} colors={colors} />
        )}

        {step === "extras" && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelAfterRoute, { color: colors.foreground }]}>
              Notiz & Fahrzeug
            </Text>
            <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Pressable
                style={styles.row}
                onPress={() => {
                  setNoteDraft(driverNote);
                  setNoteModal(true);
                }}
              >
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Notiz für Fahrer</Text>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {driverNote ? driverNote : "Optional"}
                  </Text>
                  <Feather name="chevron-right" size={20} color={colors.primary} />
                </View>
              </Pressable>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <Pressable style={styles.row} onPress={() => setLuggageModal(true)}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Koffer</Text>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{luggageLabel}</Text>
                  <Feather name="chevron-right" size={20} color={colors.primary} />
                </View>
              </Pressable>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 20, color: colors.foreground }]}>Fahrzeugwahl</Text>
            <View style={styles.vehicleRow}>
              {VEHICLES.map((v: VehicleOption) => {
                const active = selectedVehicle === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[
                      styles.vehicleCard,
                      { borderColor: colors.border, backgroundColor: colors.background },
                      active && {
                        borderColor: colors.primary,
                        borderWidth: 2,
                        backgroundColor: colors.primary + "12",
                      },
                    ]}
                    onPress={() => {
                      setSelectedVehicle(v.id as VehicleType);
                      if (v.id !== "wheelchair") setTransportschein(null);
                      Haptics.selectionAsync();
                    }}
                  >
                    <View
                      style={[
                        styles.vehicleIcon,
                        { backgroundColor: colors.muted },
                        active && { backgroundColor: colors.primary + "22" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={v.icon as any}
                        size={30}
                        color={v.id === "wheelchair" ? NB_WHEELCHAIR_ICON : NB_CAR_ICON}
                      />
                    </View>
                    <Text
                      style={[
                        styles.vehicleName,
                        { color: colors.foreground },
                        active && { color: colors.primary, fontFamily: "Inter_700Bold" },
                      ]}
                      numberOfLines={1}
                    >
                      {v.name}
                    </Text>
                    <Text style={[styles.vehicleDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {v.description}
                    </Text>
                    {active && (
                      <View style={styles.vehicleCheck}>
                        <Feather name="check-circle" size={14} color={colors.primary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {selectedVehicle === "wheelchair" && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20, color: colors.foreground }]}>
                  Transportschein
                </Text>
                <Text style={[styles.transportscheinHint, { color: colors.mutedForeground }]}>
                  Haben Sie einen Transportschein?
                </Text>
                <View style={styles.transportscheinRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTransportschein(true);
                    }}
                    style={[
                      styles.transportscheinChip,
                      { borderColor: colors.border, backgroundColor: colors.background },
                      transportschein === true && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "18",
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.transportscheinChipText,
                        { color: colors.foreground },
                        transportschein === true && { color: colors.primary, fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      Ja
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTransportschein(false);
                    }}
                    style={[
                      styles.transportscheinChip,
                      { borderColor: colors.border, backgroundColor: colors.background },
                      transportschein === false && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "18",
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.transportscheinChipText,
                        { color: colors.foreground },
                        transportschein === false && { color: colors.primary, fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      Nein
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </>
        )}

        {step === "when" && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelAfterRoute, { color: colors.foreground }]}>
              Abholzeit
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {dayChips.map((chip) => {
                const active = dayOffset === chip.offset;
                return (
                  <Pressable
                    key={chip.offset}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDayOffset(chip.offset);
                    }}
                    style={[
                      styles.dayChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                      active && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary,
                        borderWidth: 1.5,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        { color: colors.foreground },
                        active && { color: colors.primaryForeground },
                      ]}
                    >
                      {chip.label}
                    </Text>
                    <Text
                      style={[
                        styles.dayChipSub,
                        { color: colors.mutedForeground },
                        active && { color: "rgba(255,255,255,0.9)" },
                      ]}
                    >
                      {chip.sub}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.wheelRow}>
              <TimeWheel
                wheelKey={wheelKey}
                labels={hourLabels}
                selectedIndex={hour}
                onSelectIndex={setHour}
              />
              <Text style={[styles.wheelColon, { color: colors.primary }]}>:</Text>
              <TimeWheel
                wheelKey={wheelKey + 1000}
                labels={minuteLabels}
                selectedIndex={minuteIndex}
                onSelectIndex={setMinuteIndex}
              />
            </View>
            <Text style={[styles.summary, { color: colors.foreground }]}>
              {pickedDate.getDate()}. {MONTHS[pickedDate.getMonth()]} {pickedDate.getFullYear()} · {pad2(pickedDate.getHours())}:
              {pad2(pickedDate.getMinutes())} Uhr
            </Text>
          </>
        )}

        {step === "review" && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelAfterRoute, { color: colors.foreground }]}>
              Übersicht & Preis
            </Text>
            <View style={[styles.infoGroup, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Abholzeit</Text>
                <Text style={[styles.infoRowValue, { color: colors.foreground }]}>
                  {scheduledTime
                    ? `${scheduledTime.getDate()}. ${MONTHS[scheduledTime.getMonth()]} · ${pad2(scheduledTime.getHours())}:${pad2(scheduledTime.getMinutes())} Uhr`
                    : "Sofort (nächstmögliche Abholung)"}
                </Text>
              </View>
              <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Fahrzeug</Text>
                <Text style={[styles.infoRowValue, { color: colors.foreground }]}>{vehicleLabel}</Text>
              </View>
              {selectedVehicle === "wheelchair" && transportschein !== null && (
                <>
                  <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Transportschein</Text>
                    <Text style={[styles.infoRowValue, { color: colors.foreground }]}>
                      {transportschein ? "Ja" : "Nein"}
                    </Text>
                  </View>
                </>
              )}
              {(driverNote.length > 0 || luggage !== "none") && (
                <>
                  <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Notiz / Koffer</Text>
                    <Text style={[styles.infoRowValueMultiline, { color: colors.foreground }]} numberOfLines={4}>
                      {[driverNote && `Notiz: ${driverNote}`, luggage !== "none" && `Koffer: ${luggageLabel}`]
                        .filter(Boolean)
                        .join("\n")}
                    </Text>
                  </View>
                </>
              )}
              <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Preis</Text>
                <Text style={[styles.priceEmphasis, { color: colors.primary }]}>
                  {isLoadingRoute
                    ? "…"
                    : routeError
                      ? "—"
                      : fareBreakdown != null
                        ? `${formatEuro(fareBreakdown.total)} ca.`
                        : "—"}
                </Text>
              </View>
            </View>
            {routeError ? (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{routeError}</Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 12, borderTopColor: colors.border }]}>
        {step === "when" && (
          <Pressable style={styles.clearTimeBtn} onPress={clearPickupTime} hitSlop={8}>
            <Text style={[styles.clearTimeText, { color: colors.primary }]}>Abholzeit löschen</Text>
          </Pressable>
        )}
        {(step !== "where" || whereBothLockedReady) && (
          <Pressable
            style={[
              styles.btnPrimary,
              {
                backgroundColor: reviewCtaGreen ? "#16a34a" : colors.primary,
              },
              footerPrimaryDisabled && styles.btnDisabled,
            ]}
            disabled={footerPrimaryDisabled}
            onPress={() => {
              if (step === "review") handleBook();
              else void goNext();
            }}
          >
            {step === "review" && isLoadingRoute ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text
                style={[
                  styles.btnPrimaryText,
                  { color: reviewCtaGreen ? "#FFFFFF" : colors.primaryForeground },
                ]}
              >
                {footerPrimaryLabel}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      <Modal visible={noteModal} transparent animationType="fade" onRequestClose={() => setNoteModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNoteModal(false)} />
          <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.noteTitle, { color: colors.foreground }]}>Notiz für Fahrer</Text>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="z. B. Treffpunkt, Kindersitz …"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.noteInput,
                { borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <View style={styles.noteActions}>
              <Pressable onPress={() => setNoteModal(false)} style={styles.noteBtnGhost}>
                <Text style={[styles.noteBtnGhostText, { color: colors.foreground }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDriverNote(noteDraft.trim());
                  setNoteModal(false);
                  Haptics.selectionAsync();
                }}
                style={[styles.noteBtnSolid, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.noteBtnSolidText, { color: colors.primaryForeground }]}>Fertig</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={luggageModal} transparent animationType="fade" onRequestClose={() => setLuggageModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLuggageModal(false)}>
          <Pressable style={[styles.luggageCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.noteTitle, { color: colors.foreground }]}>Koffer</Text>
            {(
              [
                { id: "none" as const, title: "Kein Koffer" },
                { id: "one" as const, title: "1 Koffer" },
                { id: "several" as const, title: "Mehrere Koffer" },
              ]
            ).map((opt, i, arr) => (
              <View key={opt.id}>
                <Pressable
                  style={styles.luggageOption}
                  onPress={() => {
                    setLuggage(opt.id);
                    setLuggageModal(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.luggageOptionText, { color: colors.foreground }]}>{opt.title}</Text>
                  {luggage === opt.id ? <Feather name="check" size={20} color={colors.primary} /> : <View style={{ width: 20 }} />}
                </Pressable>
                {i < arr.length - 1 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { minWidth: 80, justifyContent: "center" },
  headerSideRight: { minWidth: 80, alignItems: "flex-end", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  addressRoutePanel: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.4,
  },
  whereStepPanel: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  whereLockedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
    borderWidth: 0,
  },
  whereLockedText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    lineHeight: 22,
    paddingVertical: 8,
  },
  addressRouteLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.35,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  addressRouteValue: { fontSize: 16, fontFamily: "Inter_500Medium", lineHeight: 23 },
  addressRouteLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  addressRouteLineMain: {
    flex: 1,
    minWidth: 140,
  },
  addressRouteCity: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
    flexShrink: 0,
    maxWidth: "48%",
  },
  whereEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  whereEditIcon: { marginRight: 2 },
  whereInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
    minHeight: 44,
  },
  whereClearBtn: { padding: 6 },
  whereSuggestions: {
    marginTop: 10,
    borderRadius: GROUP_RADIUS,
    borderWidth: 0,
    overflow: "hidden",
  },
  whereSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  whereSuggestionText: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  whereFavouritesRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  whereFavouriteChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  whereFavouriteText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  headerAbbrechen: { fontSize: 18, fontFamily: "Inter_500Medium" },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerStep: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  fieldHint: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  sectionLabelAfterRoute: {
    marginTop: 18,
  },
  scroll: { flex: 1 },
  dayRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 4,
    minWidth: 92,
  },
  dayChipText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  dayChipSub: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  wheelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  wheelWrap: { width: 88, position: "relative" },
  wheelItem: { height: WHEEL_ITEM, justifyContent: "center", alignItems: "center" },
  wheelLabelBase: { fontSize: 22, fontFamily: "Inter_400Regular" },
  wheelLabelActiveSize: { fontSize: 30, fontFamily: "Inter_700Bold" },
  wheelColon: { fontSize: 32, fontFamily: "Inter_700Bold", marginBottom: 8 },
  wheelFadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: WHEEL_ITEM * 1.25,
    zIndex: 2,
  },
  wheelFadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: WHEEL_ITEM * 1.25,
    zIndex: 2,
  },
  wheelSelectionBar: {
    position: "absolute",
    left: 4,
    right: 4,
    top: WHEEL_ITEM * 2,
    height: WHEEL_ITEM,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  group: {
    marginHorizontal: 20,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  rowLabel: { fontSize: 17, fontFamily: "Inter_400Regular", flexShrink: 0, marginRight: 12 },
  rowRight: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  rowValue: { fontSize: 17, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  vehicleRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20, justifyContent: "space-between" },
  vehicleCard: {
    width: "48%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    position: "relative",
  },
  vehicleIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleName: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  vehicleDesc: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 14,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  vehicleCheck: { position: "absolute", top: 6, right: 6 },
  transportscheinHint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 10,
  },
  transportscheinRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  transportscheinChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  transportscheinChipText: { fontSize: 17, fontFamily: "Inter_500Medium" },
  summary: {
    marginTop: 16,
    paddingHorizontal: 20,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  infoGroup: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  infoRow: { paddingVertical: 12, paddingHorizontal: 16 },
  infoRowLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoRowValue: { fontSize: 17, fontFamily: "Inter_500Medium" },
  infoRowValueMultiline: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  priceEmphasis: { fontSize: 22, fontFamily: "Inter_700Bold" },
  infoSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  errorText: { marginHorizontal: 20, marginTop: 8, fontSize: 14, fontFamily: "Inter_500Medium" },
  footer: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  clearTimeBtn: { alignSelf: "center", paddingVertical: 8, marginBottom: 4 },
  clearTimeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 24,
  },
  noteCard: {
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 12 },
  noteInput: {
    minHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  noteActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  noteBtnGhost: { paddingVertical: 10, paddingHorizontal: 12 },
  noteBtnGhostText: { fontSize: 17, fontFamily: "Inter_400Regular" },
  noteBtnSolid: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  noteBtnSolidText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  luggageCard: {
    borderRadius: 14,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  luggageOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  luggageOptionText: { fontSize: 17, fontFamily: "Inter_400Regular" },
});
