import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar, mainTabScrollPaddingBottom } from "@/components/BottomTabBar";
import { CustomerFarePriceBlock } from "@/components/CustomerFarePriceBlock";
import {
  buildScheduledDate,
  defaultScheduleWheelIndices,
  isReservationLeadValid,
  ReservationSchedulePicker,
} from "@/components/ReservationSchedulePicker";
import { accountSheetHeaderTitle, accountSheetPrimaryLabel, accountSheetSecondaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { effectivePricingModeForCustomerRide, VEHICLES, type VehicleOption, type VehicleType } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { validateServiceAreaForBooking } from "@/lib/appOperationalConfig";
import { customerVehicleSurchargeLabel } from "@/utils/customerFareDisplay";
import { formatEuro } from "@/utils/fareCalculator";
import {
  CUSTOMER_FIXED_PRICE_AGREEMENT_DE,
  fetchFixedPriceEstimate,
} from "@/utils/fixedPriceApi";
import { getRoute, searchLocation, type GeoLocation } from "@/utils/routing";
import { rs } from "@/utils/scale";

const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";

type PickTarget = "from" | "to";

type SelectedStop = {
  displayName: string;
  city?: string;
  lat: number;
  lon: number;
};

function toGeoLocation(stop: SelectedStop): GeoLocation {
  return {
    displayName: stop.displayName,
    city: stop.city,
    lat: stop.lat,
    lon: stop.lon,
  };
}

function vehicleLabelForApi(vehicle: VehicleType): string {
  if (vehicle === "xl") return "XL";
  if (vehicle === "wheelchair") return "Rollstuhl";
  return "Standard";
}

export default function BookingFixedPriceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { addRequest } = useRideRequests();

  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStop, setFromStop] = useState<SelectedStop | null>(null);
  const [toStop, setToStop] = useState<SelectedStop | null>(null);
  const [activePick, setActivePick] = useState<PickTarget>("from");
  const [suggestions, setSuggestions] = useState<GeoLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [tripMinutes, setTripMinutes] = useState<number>(0);
  const [priceEur, setPriceEur] = useState<number | null>(null);
  const [vehicleSurchargeEur, setVehicleSurchargeEur] = useState<number>(0);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [ineligibleMessage, setIneligibleMessage] = useState("");
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("standard");
  const [hasLuggage, setHasLuggage] = useState(false);
  const [driverNote, setDriverNote] = useState("");
  const [noteModal, setNoteModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [dayOffset, setDayOffset] = useState(() => defaultScheduleWheelIndices().dayOffset);
  const [hour, setHour] = useState(() => defaultScheduleWheelIndices().hour);
  const [minuteIndex, setMinuteIndex] = useState(() => defaultScheduleWheelIndices().minuteIndex);
  const [wheelKey, setWheelKey] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickedScheduleDate = useMemo(
    () => buildScheduledDate(dayOffset, hour, minuteIndex),
    [dayOffset, hour, minuteIndex],
  );

  const scheduleLeadValid = isReservationLeadValid(pickedScheduleDate);

  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/" as Href);
  }, []);

  useEffect(() => {
    const q = activePick === "from" ? fromQuery : toQuery;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const locs = await searchLocation(q.trim());
        setSuggestions(locs);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fromQuery, toQuery, activePick]);

  const recomputeRouteAndPrice = useCallback(
    async (from: SelectedStop, to: SelectedStop, vehicle: VehicleType) => {
      setRouteLoading(true);
      setEstimateLoading(true);
      setEligible(null);
      setPriceEur(null);
      setVehicleSurchargeEur(0);
      setIneligibleMessage("");
      try {
        const area = await validateServiceAreaForBooking(from.displayName, to.displayName, {
          fromLat: from.lat,
          fromLon: from.lon,
          toLat: to.lat,
          toLon: to.lon,
        });
        if (!area.ok) {
          setEligible(false);
          setIneligibleMessage(area.message);
          return;
        }
        const route = await getRoute(toGeoLocation(from), toGeoLocation(to));
        setDistanceKm(route.distanceKm);
        setTripMinutes(route.durationMinutes);
        const est = await fetchFixedPriceEstimate({
          fromFull: from.displayName,
          toFull: to.displayName,
          fromLat: from.lat,
          fromLon: from.lon,
          toLat: to.lat,
          toLon: to.lon,
          distanceKm: route.distanceKm,
          fromCity: from.city,
          toCity: to.city,
          vehicle,
        });
        if (!est.ok) {
          setEligible(false);
          setIneligibleMessage("Preis konnte nicht geladen werden.");
          return;
        }
        if (!est.eligible) {
          setEligible(false);
          setIneligibleMessage(est.message);
          return;
        }
        setEligible(true);
        setPriceEur(est.priceEur);
        setVehicleSurchargeEur(est.vehicleSurchargeEur);
      } catch {
        setEligible(false);
        setIneligibleMessage("Route oder Preis konnte nicht berechnet werden.");
      } finally {
        setRouteLoading(false);
        setEstimateLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!fromStop || !toStop) return;
    void recomputeRouteAndPrice(fromStop, toStop, selectedVehicle);
  }, [fromStop, toStop, selectedVehicle, recomputeRouteAndPrice]);

  const pickSuggestion = (loc: GeoLocation) => {
    const stop: SelectedStop = {
      displayName: loc.displayName,
      city: loc.city,
      lat: loc.lat,
      lon: loc.lon,
    };
    if (activePick === "from") {
      setFromStop(stop);
      setFromQuery(loc.displayName);
      if (toStop) void recomputeRouteAndPrice(stop, toStop, selectedVehicle);
      else setActivePick("to");
    } else {
      setToStop(stop);
      setToQuery(loc.displayName);
      if (fromStop) void recomputeRouteAndPrice(fromStop, stop, selectedVehicle);
    }
    setSuggestions([]);
    Haptics.selectionAsync();
  };

  const surchargeLabel = customerVehicleSurchargeLabel({
    vehicle: selectedVehicle,
    surchargeEur: vehicleSurchargeEur,
  });

  const canSubmit = useMemo(
    () =>
      !!fromStop &&
      !!toStop &&
      eligible === true &&
      priceEur != null &&
      priceEur > 0 &&
      agreementAccepted &&
      scheduleLeadValid &&
      !submitting,
    [fromStop, toStop, eligible, priceEur, agreementAccepted, scheduleLeadValid, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit || !fromStop || !toStop || priceEur == null) return;
    if (!profile.isLoggedIn) {
      Alert.alert("Anmeldung", "Bitte zuerst anmelden, um eine Festpreis-Fahrt zu buchen.");
      return;
    }
    if (!isReservationLeadValid(pickedScheduleDate)) {
      Alert.alert(
        "Termin",
        "Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte einen späteren Zeitpunkt wählen.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const customerName = profile.name?.trim() || "Gast";
      const pricingMode = effectivePricingModeForCustomerRide({
        selectedServiceClass: "taxi",
        selectedVehicle,
        origin: toGeoLocation(fromStop),
        destination: toGeoLocation(toStop),
        bookingFlow: "fixed_price",
      });
      const noteParts = [
        driverNote.trim(),
        hasLuggage ? "Gepäck: Ja" : null,
      ].filter(Boolean);
      const partnerBookingMeta =
        noteParts.length > 0 ? { partnerBookingMeta: { customer_driver_note: noteParts.join(" · ") } } : {};
      await addRequest({
        from: fromStop.displayName.split(",")[0]?.trim() || fromStop.displayName,
        fromFull: fromStop.displayName,
        fromLat: fromStop.lat,
        fromLon: fromStop.lon,
        fromCity: fromStop.city,
        to: toStop.displayName.split(",")[0]?.trim() || toStop.displayName,
        toFull: toStop.displayName,
        toLat: toStop.lat,
        toLon: toStop.lon,
        toCity: toStop.city,
        distanceKm: distanceKm ?? 0,
        durationMinutes: tripMinutes,
        estimatedFare: priceEur,
        paymentMethod: paymentMethod === "cash" ? "Bar" : "Karte",
        vehicle: vehicleLabelForApi(selectedVehicle),
        customerName,
        scheduledAt: pickedScheduleDate,
        rideKind: "standard",
        payerKind: "passenger",
        pricingMode,
        fixedPriceAgreementAccepted: true,
        ...partnerBookingMeta,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/my-rides" as Href);
    } catch (e) {
      const code = e instanceof Error ? e.message : "request_failed";
      const errWithMsg = e as Error & { userMessage?: string };
      const msg =
        typeof errWithMsg.userMessage === "string" && errWithMsg.userMessage.trim()
          ? errWithMsg.userMessage.trim()
          : code === "fixed_price_agreement_required"
            ? "Bitte die Fahrpreisvereinbarung bestätigen."
            : code === "reservation_lead_time_too_short"
              ? "Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte einen späteren Zeitpunkt wählen."
              : code === "both_in_mandatory_area" ||
                  code === "same_city" ||
                  code === "inside_mandatory_taxi_area" ||
                  code === "fixed_price_not_eligible"
                ? "Festpreis für diese Strecke nicht verfügbar."
                : "Die Buchung ist fehlgeschlagen. Bitte erneut versuchen.";
      Alert.alert("Festpreis", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <Pressable onPress={exit} hitSlop={10} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Festpreis</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: rs(16), paddingBottom: mainTabScrollPaddingBottom(insets.bottom) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Garantierter Preis, kein Taxameter. Termin ab 60 Minuten Vorlauf.
        </Text>

        <View style={[styles.card, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Text style={[styles.label, { color: colors.foreground }]}>Start</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: activePick === "from" ? ONRODA_MARK_RED : HOME_SHEET_RIM }]}
            placeholder="Abholadresse"
            placeholderTextColor={colors.mutedForeground}
            value={fromQuery}
            onChangeText={(t) => {
              setFromQuery(t);
              setFromStop(null);
              setActivePick("from");
              setEligible(null);
              setPriceEur(null);
            }}
            onFocus={() => setActivePick("from")}
          />
          <Text style={[styles.label, { color: colors.foreground, marginTop: rs(12) }]}>Ziel</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: activePick === "to" ? ONRODA_MARK_RED : HOME_SHEET_RIM }]}
            placeholder="Zieladresse"
            placeholderTextColor={colors.mutedForeground}
            value={toQuery}
            onChangeText={(t) => {
              setToQuery(t);
              setToStop(null);
              setActivePick("to");
              setEligible(null);
              setPriceEur(null);
            }}
            onFocus={() => setActivePick("to")}
          />
        </View>

        {searching ? (
          <ActivityIndicator style={{ marginTop: rs(12) }} color={colors.primary} />
        ) : null}

        {suggestions.length > 0 ? (
          <View style={[styles.suggestBox, { borderColor: HOME_SHEET_RIM }]}>
            {suggestions.map((loc, i) => (
              <Pressable
                key={`${loc.lat}-${loc.lon}-${i}`}
                style={[styles.suggestRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HOME_SHEET_RIM }]}
                onPress={() => pickSuggestion(loc)}
              >
                <Feather name="map-pin" size={16} color={colors.mutedForeground} />
                <Text style={[styles.suggestText, { color: colors.foreground }]} numberOfLines={2}>
                  {loc.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {routeLoading || estimateLoading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Festpreisprüfung …</Text>
          </View>
        ) : null}

        {fromStop && toStop ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Fahrzeugwahl</Text>
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
                      setSelectedVehicle(v.id);
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
                    {active && selectedVehicle !== "standard" && surchargeLabel ? (
                      <Text style={[styles.vehicleSurcharge, { color: colors.primary }]}>{surchargeLabel}</Text>
                    ) : null}
                    {active ? (
                      <View style={styles.vehicleCheck}>
                        <Feather name="check-circle" size={14} color={colors.primary} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.background, marginTop: rs(16) }]}>
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
              <View style={styles.row}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name="briefcase" size={18} color={colors.foreground} />
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>Gepäck</Text>
                </View>
                <Switch
                  value={hasLuggage}
                  onValueChange={(v) => {
                    Haptics.selectionAsync();
                    setHasLuggage(v);
                  }}
                  trackColor={{ false: colors.border, true: "#22C55E" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            <ReservationSchedulePicker
              uiVariant="reservation"
              hideTimingToggle
              timing="scheduled"
              onTimingChange={() => {}}
              dayOffset={dayOffset}
              hour={hour}
              minuteIndex={minuteIndex}
              onDayOffsetChange={setDayOffset}
              onHourChange={setHour}
              onMinuteIndexChange={setMinuteIndex}
              wheelKey={wheelKey}
            />
          </>
        ) : null}

        {eligible === true && priceEur != null ? (
          <View style={[styles.priceCard, { borderColor: "#BBF7D0", backgroundColor: "#ECFDF5" }]}>
            <CustomerFarePriceBlock
              vehicle={selectedVehicle}
              pricingMode="fixed_price"
              priceEur={priceEur}
              align="center"
              primaryStyle={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#166534" }}
              secondaryStyle={{ fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground }}
            />
            {surchargeLabel && vehicleSurchargeEur > 0 ? (
              <Text style={[styles.surchargeLine, { color: "#2563EB" }]}>{surchargeLabel}</Text>
            ) : null}
            {distanceKm != null ? (
              <Text style={[styles.priceMeta, { color: colors.mutedForeground }]}>
                ca. {distanceKm.toFixed(1).replace(".", ",")} km — verbindlich für diese Buchung
              </Text>
            ) : null}
          </View>
        ) : null}

        {eligible === false && ineligibleMessage ? (
          <View style={[styles.priceCard, { borderColor: "#FECACA", backgroundColor: "#FEF2F2" }]}>
            <Text style={[styles.priceOk, { color: "#B91C1C" }]}>Kein Festpreis</Text>
            <Text style={[styles.priceMeta, { color: "#7F1D1D" }]}>{ineligibleMessage}</Text>
          </View>
        ) : null}

        {eligible === true && priceEur != null ? (
          <>
            <View style={[styles.card, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL, marginTop: rs(12) }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>Zahlung</Text>
              <View style={styles.payRow}>
                {(["cash", "card"] as const).map((m) => {
                  const active = paymentMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.payChip, active && styles.payChipActive]}
                      onPress={() => setPaymentMethod(m)}
                    >
                      <Text style={[styles.payChipText, active && styles.payChipTextActive]}>
                        {m === "cash" ? "Bar" : "Karte"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              style={styles.agreeRow}
              onPress={() => setAgreementAccepted((v) => !v)}
            >
              <View style={[styles.checkbox, agreementAccepted && styles.checkboxOn]}>
                {agreementAccepted ? <Feather name="check" size={14} color="#fff" /> : null}
              </View>
              <Text style={[styles.agreeText, { color: colors.foreground }]}>{CUSTOMER_FIXED_PRICE_AGREEMENT_DE}</Text>
            </Pressable>

            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Festpreis reservieren — {formatEuro(priceEur)}</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={noteModal} transparent animationType="fade" onRequestClose={() => setNoteModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNoteModal(false)}>
          <Pressable style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.label, { color: colors.foreground }]}>Notiz für Fahrer</Text>
            <TextInput
              style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="z. B. Treffpunkt, Koffer …"
              placeholderTextColor={colors.mutedForeground}
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              maxLength={300}
            />
            <Pressable
              style={[styles.submitBtn, { marginTop: rs(12) }]}
              onPress={() => {
                setDriverNote(noteDraft.trim());
                setNoteModal(false);
              }}
            >
              <Text style={styles.submitText}>Speichern</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomTabBar active="buchen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: rs(36), height: rs(36), alignItems: "center", justifyContent: "center" },
  headerTitle: accountSheetHeaderTitle,
  lead: {
    ...accountSheetSecondaryLabel,
    marginBottom: rs(12),
    color: "#111827",
    fontFamily: "Inter_400Regular",
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: rs(18),
    marginBottom: 10,
  },
  card: {
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
  },
  label: { ...accountSheetPrimaryLabel, marginBottom: rs(6) },
  input: {
    borderWidth: 1,
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  suggestBox: {
    marginTop: rs(8),
    borderWidth: 1,
    borderRadius: rs(12),
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    padding: rs(12),
  },
  suggestText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(14) },
  vehicleRow: { flexDirection: "row", gap: 10 },
  vehicleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    alignItems: "center",
    minHeight: 120,
    position: "relative",
  },
  vehicleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  vehicleName: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  vehicleDesc: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
  vehicleSurcharge: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  vehicleCheck: { position: "absolute", top: 8, right: 8 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" },
  rowValue: { fontSize: 15, fontFamily: "Inter_400Regular", maxWidth: "55%", textAlign: "right" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  priceCard: {
    marginTop: rs(14),
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
    alignItems: "center",
  },
  priceOk: { fontFamily: "Inter_700Bold", fontSize: 15 },
  surchargeLine: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 6 },
  priceMeta: { ...accountSheetSecondaryLabel, marginTop: rs(6), textAlign: "center" },
  payRow: { flexDirection: "row", gap: rs(8) },
  payChip: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(8),
    borderRadius: rs(999),
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    backgroundColor: HOME_SHEET_INNER,
  },
  payChipActive: { borderColor: ONRODA_MARK_RED, backgroundColor: "#FEE2E2" },
  payChipText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#374151" },
  payChipTextActive: { color: ONRODA_MARK_RED },
  agreeRow: { flexDirection: "row", gap: rs(10), marginTop: rs(16), alignItems: "flex-start" },
  checkbox: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(6),
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: rs(2),
  },
  checkboxOn: { backgroundColor: ONRODA_MARK_RED, borderColor: ONRODA_MARK_RED },
  agreeText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  submitBtn: {
    marginTop: rs(16),
    backgroundColor: ONRODA_MARK_RED,
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  noteCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    marginTop: 8,
  },
});
