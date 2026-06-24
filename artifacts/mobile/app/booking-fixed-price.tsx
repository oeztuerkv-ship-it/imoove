import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar, mainTabScrollPaddingBottom } from "@/components/BottomTabBar";
import { accountSheetHeaderTitle, accountSheetPrimaryLabel, accountSheetSecondaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { effectivePricingModeForCustomerRide } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { validateServiceAreaForBooking } from "@/lib/appOperationalConfig";
import { isFixedPriceOutsideMandatoryAreaEligible } from "@/utils/mandatoryTaxiArea";
import { formatEuro } from "@/utils/fareCalculator";
import {
  CUSTOMER_FIXED_PRICE_AGREEMENT_DE,
  fetchFixedPriceEstimate,
} from "@/utils/fixedPriceApi";
import { getRoute, searchLocation, type GeoLocation } from "@/utils/routing";
import { rs } from "@/utils/scale";

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
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [ineligibleMessage, setIneligibleMessage] = useState("");
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [submitting, setSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const recomputeRouteAndPrice = useCallback(async (from: SelectedStop, to: SelectedStop) => {
    setRouteLoading(true);
    setEstimateLoading(true);
    setEligible(null);
    setPriceEur(null);
    setIneligibleMessage("");
    try {
      const clientEligible = isFixedPriceOutsideMandatoryAreaEligible(toGeoLocation(from), toGeoLocation(to));
      if (!clientEligible) {
        setEligible(false);
        setIneligibleMessage(
          "Festpreis gilt nur außerhalb von Stuttgart und Esslingen. Bitte normale Taxameter-Buchung wählen.",
        );
        return;
      }
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
    } catch {
      setEligible(false);
      setIneligibleMessage("Route oder Preis konnte nicht berechnet werden.");
    } finally {
      setRouteLoading(false);
      setEstimateLoading(false);
    }
  }, []);

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
      if (toStop) void recomputeRouteAndPrice(stop, toStop);
      else setActivePick("to");
    } else {
      setToStop(stop);
      setToQuery(loc.displayName);
      if (fromStop) void recomputeRouteAndPrice(fromStop, stop);
    }
    setSuggestions([]);
    Haptics.selectionAsync();
  };

  const canSubmit = useMemo(
    () =>
      !!fromStop &&
      !!toStop &&
      eligible === true &&
      priceEur != null &&
      priceEur > 0 &&
      agreementAccepted &&
      !submitting,
    [fromStop, toStop, eligible, priceEur, agreementAccepted, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit || !fromStop || !toStop || priceEur == null) return;
    if (!profile.isLoggedIn) {
      Alert.alert("Anmeldung", "Bitte zuerst anmelden, um eine Festpreis-Fahrt zu buchen.");
      return;
    }
    setSubmitting(true);
    try {
      const customerName = profile.name?.trim() || "Gast";
      const pricingMode = effectivePricingModeForCustomerRide({
        selectedServiceClass: "taxi",
        selectedVehicle: "standard",
        origin: toGeoLocation(fromStop),
        destination: toGeoLocation(toStop),
        bookingFlow: "fixed_price",
      });
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
        vehicle: "standard",
        customerName,
        scheduledAt: null,
        rideKind: "standard",
        payerKind: "passenger",
        pricingMode,
        fixedPriceAgreementAccepted: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/my-rides" as Href);
    } catch (e) {
      const code = e instanceof Error ? e.message : "request_failed";
      const msg =
        code === "fixed_price_agreement_required"
          ? "Bitte die Fahrpreisvereinbarung bestätigen."
          : code === "inside_mandatory_taxi_area" || code === "fixed_price_not_eligible"
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
        contentContainerStyle={{ padding: rs(16), paddingBottom: mainTabScrollPaddingBottom(insets.bottom) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: colors.mutedForeground }]}>
          Für Fahrten außerhalb von Stuttgart und Esslingen — verbindlicher Festpreis vor der Buchung.
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

        {eligible === true && priceEur != null ? (
          <View style={[styles.priceCard, { borderColor: "#BBF7D0", backgroundColor: "#ECFDF5" }]}>
            <Text style={[styles.priceOk, { color: "#166534" }]}>Festpreis verfügbar</Text>
            <Text style={[styles.priceAmount, { color: colors.foreground }]}>{formatEuro(priceEur)}</Text>
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
                <Text style={styles.submitText}>Festpreis buchen — {formatEuro(priceEur)}</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
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
  lead: { ...accountSheetSecondaryLabel, marginBottom: rs(12) },
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
  priceCard: {
    marginTop: rs(14),
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
    alignItems: "center",
  },
  priceOk: { fontFamily: "Inter_700Bold", fontSize: 15 },
  priceAmount: { fontFamily: "Inter_700Bold", fontSize: 28, marginTop: rs(4) },
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
});
