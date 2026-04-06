import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

  const {
    setScheduledTime,
    destination,
    setDestination,
    setOrigin,
    origin,
    fareBreakdown,
    selectedVehicle,
    setSelectedVehicle,
    setIsExempted,
    fetchRoute,
    isLoadingRoute,
    routeError,
    resetRide,
  } = useRide();

  const [step, setStep] = useState<Step>("where");

  /** Manuell gewählte Abholadresse (kein automatischer Standort). */
  const [pickupResolved, setPickupResolved] = useState<GeoLocation | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickupResults, setPickupResults] = useState<GeoLocation[]>([]);
  const [pickupLoading, setPickupLoading] = useState(false);
  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [destQuery, setDestQuery] = useState(() =>
    destination ? shortPlace(destination.displayName) : "",
  );
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

  /** True, wenn der Screen mit bereits gesetztem Ziel (z. B. von der Karte / Fahrt-reservieren) geöffnet wurde → keine doppelte Adresseingabe in „Extras“. */
  const openedWithDestination = useRef(!!destination);
  const didSeedAddresses = useRef(false);
  const [addressFieldsLocked, setAddressFieldsLocked] = useState(false);

  /* Abholung: ohne GPS-Bias – Nutzer gibt Adresse selbst ein. */
  useEffect(() => {
    if (pickupQuery.length < 2) {
      setPickupResults([]);
      return;
    }
    if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    pickupDebounceRef.current = setTimeout(async () => {
      setPickupLoading(true);
      try {
        const locs = await searchLocation(
          pickupQuery,
          destination ? { lat: destination.lat, lon: destination.lon } : undefined,
        );
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
  }, [pickupQuery, destination]);

  /* Ziel: optional nur regionaler Bias nach gewählter Abholung, nicht Standort vom Gerät. */
  useEffect(() => {
    if (destQuery.length < 2) {
      setDestResults([]);
      return;
    }
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(async () => {
      setDestLoading(true);
      try {
        const locs = await searchLocation(
          destQuery,
          pickupResolved ? { lat: pickupResolved.lat, lon: pickupResolved.lon } : undefined,
        );
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
  }, [destQuery, pickupResolved]);

  useEffect(() => {
    if (pickupResolved) setOrigin(pickupResolved);
  }, [pickupResolved, setOrigin]);

  /** Route war schon bekannt beim Öffnen → Adressen ins Formular übernehmen und Schritt „Wo“ überspringen. */
  useEffect(() => {
    if (didSeedAddresses.current) return;
    if (!openedWithDestination.current || !destination) return;
    didSeedAddresses.current = true;
    setPickupResolved(origin);
    setPickupQuery(shortPlace(origin.displayName));
    setDestQuery(shortPlace(destination.displayName));
    setStep("extras");
    setAddressFieldsLocked(true);
  }, [destination, origin]);

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
    commitSchedule();
    router.push("/ride");
  }, [pickupResolved, destination, selectedVehicle, isLoadingRoute, fareBreakdown, commitSchedule]);

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
        : "Reservieren"
      : "Weiter";

  const reviewCtaGreen = step === "review" && !footerPrimaryDisabled && !isLoadingRoute;

  const stepIndex = step === "where" ? 1 : step === "extras" ? 2 : step === "when" ? 3 : 4;

  const pickDestination = (loc: GeoLocation) => {
    setDestination(loc);
    setDestQuery(shortPlace(loc.displayName));
    setDestResults([]);
    Haptics.selectionAsync();
  };

  const pickPickup = (loc: GeoLocation) => {
    setPickupResolved(loc);
    setPickupQuery(shortPlace(loc.displayName));
    setPickupResults([]);
    Haptics.selectionAsync();
  };

  const clearDestination = useCallback(() => {
    setDestination(null);
    setDestQuery("");
    setDestResults([]);
    Haptics.selectionAsync();
  }, [setDestination]);

  const clearPickup = useCallback(() => {
    setPickupResolved(null);
    setPickupQuery("");
    setPickupResults([]);
    setOrigin(DEFAULT_ORIGIN);
    Haptics.selectionAsync();
  }, [setOrigin]);

  const handleCancelReservation = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetRide();
    setOrigin(DEFAULT_ORIGIN);
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
    setAddressFieldsLocked(false);
    didSeedAddresses.current = false;
    openedWithDestination.current = false;
    router.back();
  }, [resetRide, setOrigin, setIsExempted]);

  return (
    <View style={[styles.root, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={12} onPress={handleCancelReservation} style={styles.headerSide}>
          <Text style={[styles.headerAbbrechen, { color: colors.primary }]}>Abbrechen</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.titleFrame}>
            <Text style={[styles.headerTitle, { color: colors.primary }]} numberOfLines={2}>
              FAHRT reservieren
            </Text>
          </View>
          <Text style={[styles.headerStep, { color: colors.mutedForeground }]}>
            Schritt {stepIndex} von 4
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
        {step === "where" && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 16, color: colors.foreground }]}>
              Abholadresse
            </Text>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
              Bitte Adresse eingeben oder aus der Liste wählen – nicht automatisch vom Standort.
            </Text>
            <View
              style={[
                styles.destEditCard,
                { borderColor: colors.primary, backgroundColor: colors.background },
              ]}
            >
              <View style={styles.destEditInner}>
                <Feather name="navigation" size={18} color={colors.primary} style={{ marginRight: 4 }} />
                <TextInput
                  style={[styles.destEditInput, { color: colors.foreground }]}
                  value={pickupQuery}
                  onChangeText={(t) => {
                    setPickupQuery(t);
                    if (pickupResolved) {
                      const prev = shortPlace(pickupResolved.displayName);
                      if (t !== prev) {
                        setPickupResolved(null);
                        setOrigin(DEFAULT_ORIGIN);
                      }
                    }
                  }}
                  placeholder="Abholung: Straße, PLZ Ort …"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {(pickupQuery.length > 0 || pickupResolved != null) && (
                  <Pressable
                    hitSlop={10}
                    onPress={clearPickup}
                    style={styles.destClearBtn}
                    accessibilityLabel="Abholadresse löschen"
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                )}
                {pickupLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </View>
            </View>
            {pickupResults.length > 0 && (
              <View style={[styles.resultsBox, { borderColor: colors.border }]}>
                {pickupResults.map((loc, i) => (
                  <Pressable
                    key={`pu-${loc.lat}-${loc.lon}-${i}`}
                    style={[
                      styles.resultRow,
                      { backgroundColor: colors.background },
                      i < pickupResults.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                    onPress={() => pickPickup(loc)}
                  >
                    <Feather name="map-pin" size={16} color={colors.primary} />
                    <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                      {loc.displayName}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 22, color: colors.foreground }]}>
              Zieladresse
            </Text>
            <View
              style={[
                styles.destEditCard,
                { borderColor: colors.primary, backgroundColor: colors.background },
              ]}
            >
              <View style={styles.destEditInner}>
                <Feather name="search" size={18} color={colors.primary} style={{ marginRight: 4 }} />
                <TextInput
                  style={[styles.destEditInput, { color: colors.foreground }]}
                  value={destQuery}
                  onChangeText={(t) => {
                    setDestQuery(t);
                    if (destination && t !== shortPlace(destination.displayName)) {
                      setDestination(null);
                    }
                  }}
                  placeholder="Wohin soll&apos;s gehen? …"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {(destQuery.length > 0 || destination != null) && (
                  <Pressable
                    hitSlop={10}
                    onPress={clearDestination}
                    style={styles.destClearBtn}
                    accessibilityLabel="Zieladresse löschen"
                  >
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                )}
                {destLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </View>
            </View>
            {destResults.length > 0 && (
              <View style={[styles.resultsBox, { borderColor: colors.border }]}>
                {destResults.map((loc, i) => (
                  <Pressable
                    key={`de-${loc.lat}-${loc.lon}-${i}`}
                    style={[
                      styles.resultRow,
                      { backgroundColor: colors.background },
                      i < destResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                    onPress={() => pickDestination(loc)}
                  >
                    <Feather name="map-pin" size={16} color={colors.primary} />
                    <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                      {loc.displayName}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {step === "extras" && (
          <>
            {addressFieldsLocked ? (
              <View
                style={[
                  styles.lockedRouteCard,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                <Text style={[styles.lockedRouteLabel, { color: colors.mutedForeground }]}>Abholung</Text>
                <Text style={[styles.lockedRouteValue, { color: colors.foreground }]} numberOfLines={4}>
                  {origin.displayName}
                </Text>
                <Text style={[styles.lockedRouteLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Ziel</Text>
                <Text style={[styles.lockedRouteValue, { color: colors.foreground }]} numberOfLines={4}>
                  {destination?.displayName ?? "—"}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Abholadresse</Text>
                <View
                  style={[
                    styles.destEditCard,
                    { borderColor: colors.primary, backgroundColor: colors.background },
                  ]}
                >
                  <View style={styles.destEditInner}>
                    <Feather name="navigation" size={18} color={colors.primary} style={{ marginRight: 4 }} />
                    <TextInput
                      style={[styles.destEditInput, { color: colors.foreground }]}
                      value={pickupQuery}
                      onChangeText={(t) => {
                        setPickupQuery(t);
                        if (pickupResolved) {
                          const prev = shortPlace(pickupResolved.displayName);
                          if (t !== prev) {
                            setPickupResolved(null);
                            setOrigin(DEFAULT_ORIGIN);
                          }
                        }
                      }}
                      placeholder="Abholung …"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    {(pickupQuery.length > 0 || pickupResolved != null) && (
                      <Pressable hitSlop={10} onPress={clearPickup} style={styles.destClearBtn} accessibilityLabel="Abholadresse löschen">
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                    {pickupLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                </View>
                {pickupResults.length > 0 && (
                  <View style={[styles.resultsBox, { borderColor: colors.border }]}>
                    {pickupResults.map((loc, i) => (
                      <Pressable
                        key={`ex-pu-${loc.lat}-${loc.lon}-${i}`}
                        style={[
                          styles.resultRow,
                          { backgroundColor: colors.background },
                          i < pickupResults.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                          },
                        ]}
                        onPress={() => pickPickup(loc)}
                      >
                        <Feather name="map-pin" size={16} color={colors.primary} />
                        <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                          {loc.displayName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={[styles.sectionLabel, { marginTop: 18, color: colors.foreground }]}>
                  Wohin soll&apos;s gehen?
                </Text>
                <View
                  style={[
                    styles.destEditCard,
                    { borderColor: colors.primary, backgroundColor: colors.background },
                  ]}
                >
                  <View style={styles.destEditInner}>
                    <Feather name="search" size={18} color={colors.primary} style={{ marginRight: 4 }} />
                    <TextInput
                      style={[styles.destEditInput, { color: colors.foreground }]}
                      value={destQuery}
                      onChangeText={(t) => {
                        setDestQuery(t);
                        if (destination) {
                          const prev = shortPlace(destination.displayName);
                          if (t !== prev) setDestination(null);
                        }
                      }}
                      placeholder="Ziel eingeben …"
                      placeholderTextColor={colors.mutedForeground}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    {(destQuery.length > 0 || destination != null) && (
                      <Pressable
                        hitSlop={10}
                        onPress={clearDestination}
                        style={styles.destClearBtn}
                        accessibilityLabel="Zieladresse löschen"
                      >
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                    {destLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                </View>
                {destResults.length > 0 && (
                  <View style={[styles.resultsBox, { borderColor: colors.border }]}>
                    {destResults.map((loc, i) => (
                      <Pressable
                        key={`ex-de-${loc.lat}-${loc.lon}-${i}`}
                        style={[
                          styles.resultRow,
                          { backgroundColor: colors.background },
                          i < destResults.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                          },
                        ]}
                        onPress={() => pickDestination(loc)}
                      >
                        <Feather name="map-pin" size={16} color={colors.primary} />
                        <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={2}>
                          {loc.displayName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 18, color: colors.foreground }]}>
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
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Abholzeit</Text>
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
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Übersicht & Preis</Text>
            <View style={[styles.infoGroup, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Von</Text>
                <Text style={[styles.infoRowValue, { color: colors.foreground }]} numberOfLines={2}>
                  {shortPlace(origin.displayName)}
                </Text>
              </View>
              <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Nach</Text>
                <Text style={[styles.infoRowValue, { color: colors.foreground }]} numberOfLines={2}>
                  {destination ? shortPlace(destination.displayName) : "—"}
                </Text>
              </View>
              <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Ziel</Text>
                <Text style={[styles.infoRowValueMultiline, { color: colors.foreground }]} numberOfLines={4}>
                  {destination?.displayName ?? "—"}
                </Text>
              </View>
              <View style={[styles.infoSeparator, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoRowLabel, { color: colors.mutedForeground }]}>Abholzeit</Text>
                <Text style={[styles.infoRowValue, { color: colors.foreground }]}>
                  {pickedDate.getDate()}. {MONTHS[pickedDate.getMonth()]} · {pad2(pickedDate.getHours())}:{pad2(pickedDate.getMinutes())} Uhr
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
  titleFrame: {
    borderWidth: 2,
    borderColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "center",
    maxWidth: "92%",
  },
  lockedRouteCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockedRouteLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.35,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  lockedRouteValue: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  headerAbbrechen: { fontSize: 17, fontFamily: "Inter_400Regular" },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerStep: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  fieldHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  destEditCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: GROUP_RADIUS,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  destEditInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  destEditInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 4,
    minHeight: 28,
  },
  destClearBtn: { padding: 6 },
  resultsBox: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  resultText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  pickedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickedBannerText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  scroll: { flex: 1 },
  dayRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 4,
    minWidth: 92,
  },
  dayChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dayChipSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
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
    marginHorizontal: 16,
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
  vehicleRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, justifyContent: "space-between" },
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
  vehicleName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  vehicleDesc: {
    fontSize: 11,
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
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  transportscheinRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
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
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  infoRow: { paddingVertical: 12, paddingHorizontal: 16 },
  infoRowLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoRowValue: { fontSize: 17, fontFamily: "Inter_500Medium" },
  infoRowValueMultiline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  priceEmphasis: { fontSize: 22, fontFamily: "Inter_700Bold" },
  infoSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  errorText: { marginHorizontal: 20, marginTop: 8, fontSize: 14, fontFamily: "Inter_500Medium" },
  footer: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
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
