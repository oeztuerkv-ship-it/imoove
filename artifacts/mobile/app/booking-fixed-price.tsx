import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddSearchFavoriteModal } from "@/components/AddSearchFavoriteModal";
import { BottomTabBar, mainTabScrollPaddingBottom } from "@/components/BottomTabBar";
import { BookingDateTimePicker } from "@/components/booking/BookingDateTimePicker";
import { FixpreisDestinationQuickPicks } from "@/components/booking/FixpreisDestinationQuickPicks";
import {
  defaultScheduledPickupDate,
  formatBookingDateTime,
  minimumScheduledPickupDate,
} from "@/components/booking/bookingDateTime";
import { LiveSearchResultGroup } from "@/components/booking/LiveSearchResultGroup";
import { LiveSearchRouteCard } from "@/components/booking/LiveSearchRouteCard";
import { liveSearchRouteStyles as liveStyles } from "@/components/booking/liveSearchRouteStyles";
import {
  EMPTY_SELECTED_ADDRESS,
  geoLocationToSelectedAddress,
  selectedAddressIsComplete,
  selectedAddressToGeoLocation,
  type SelectedAddress,
} from "@/components/booking/selectedAddress";
import { taxiRouteCardStyles as routeStyles } from "@/components/booking/taxiAddressInputStyles";
import { CollapsibleBrokerNotice } from "@/components/CollapsibleBrokerNotice";
import { CustomerFarePriceBlock } from "@/components/CustomerFarePriceBlock";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { isReservationLeadValid } from "@/components/ReservationSchedulePicker";
import { accountSheetHeaderTitle, accountSheetPrimaryLabel, accountSheetSecondaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { effectivePricingModeForCustomerRide, VEHICLES, type VehicleOption, type VehicleType } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { fetchAppConfig } from "@/lib/appConfig";
import { validateServiceAreaForBooking } from "@/lib/appOperationalConfig";
import {
  isGeocodedFixpreisLocation,
  MESSAGE_FIXPREIS_ADDRESS_REQUIRED_DE,
  validateFixpreisRouteLocation,
} from "@/lib/appConfig";
import { customerVehicleSurchargeLabel } from "@/utils/customerFareDisplay";
import { formatEuro } from "@/utils/fareCalculator";
import {
  CUSTOMER_FIXED_PRICE_AGREEMENT_DE,
  fetchFixedPriceEstimate,
} from "@/utils/fixedPriceApi";
import {
  evaluateFixedPriceEligibility,
  parseFixedPriceMandatoryAreaCities,
  selectedAddressToFixedPricePoint,
} from "@/utils/fixedPriceEligibility";
import { reverseGeocodeCoords } from "@/utils/reverseGeocode";
import { ROUTE_NOT_COMPUTABLE_MESSAGE_DE } from "@/utils/routeDistanceApi";
import { searchLocation, type GeoLocation } from "@/utils/routing";
import {
  FIXPRICE_DESTINATION_PRESETS,
  loadSearchFavorites,
  MAX_FAVORITES_STORED,
  type SearchFavorite,
} from "@/utils/searchFavorites";
import { getCurrentPositionSafe, requestForegroundPermissionsSafe } from "@/utils/safeExpoLocation";
import { rs } from "@/utils/scale";

const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";

function vehicleLabelForApi(vehicle: VehicleType): string {
  if (vehicle === "xl") return "XL";
  if (vehicle === "wheelchair") return "Rollstuhl";
  return "Standard";
}

function cityForApi(addr: SelectedAddress): string | undefined {
  const c = addr.city?.trim();
  if (c) return c;
  const fromPoint = selectedAddressToFixedPricePoint(addr);
  return fromPoint.city?.trim() || undefined;
}

export default function BookingFixedPriceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { addRequest } = useRideRequests();

  const [from, setFrom] = useState<SelectedAddress>(EMPTY_SELECTED_ADDRESS);
  const [to, setTo] = useState<SelectedAddress>(EMPTY_SELECTED_ADDRESS);
  const [isEditingOrigin, setIsEditingOrigin] = useState(true);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originResults, setOriginResults] = useState<GeoLocation[]>([]);
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [tripMinutes, setTripMinutes] = useState<number>(0);
  const [priceEur, setPriceEur] = useState<number | null>(null);
  const [basePriceEur, setBasePriceEur] = useState<number | null>(null);
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
  const [scheduledAt, setScheduledAt] = useState<Date | null>(() => defaultScheduledPickupDate());
  const [showDtPicker, setShowDtPicker] = useState(false);
  const [searchUserGps, setSearchUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userDestinationFavorites, setUserDestinationFavorites] = useState<SearchFavorite[]>([]);
  const [addFavoriteOpen, setAddFavoriteOpen] = useState(false);

  const reloadUserFavorites = useCallback(async () => {
    const stored = await loadSearchFavorites();
    setUserDestinationFavorites(stored.filter((f) => isGeocodedFixpreisLocation(f.location)));
  }, []);

  useEffect(() => {
    void reloadUserFavorites();
  }, [reloadUserFavorites]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fg = await requestForegroundPermissionsSafe();
        if (!fg || fg.status !== "granted" || cancelled) return;
        const pos = await getCurrentPositionSafe({ accuracy: Location.Accuracy.Balanced });
        if (pos && !cancelled) {
          setSearchUserGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fromComplete = selectedAddressIsComplete(from);
  const toComplete = selectedAddressIsComplete(to);
  const routeComplete = fromComplete && toComplete;

  const showOriginResults =
    isEditingOrigin && (originResults.length > 0 || isSearchingOrigin);
  const showDestResults = !isEditingOrigin && destResults.length > 0;
  const showDestQuickPicks =
    !isEditingOrigin && !showDestResults && !isSearchingDest;
  const showAddressHint =
    isEditingOrigin && !showOriginResults && originQuery.trim().length < 2;

  const exit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) router.back();
    else router.replace("/" as Href);
  }, []);

  const resetPricing = useCallback(() => {
    setEligible(null);
    setPriceEur(null);
    setBasePriceEur(null);
    setVehicleSurchargeEur(0);
    setIneligibleMessage("");
  }, []);

  const handleOriginQueryChange = useCallback(
    (text: string) => {
      setOriginQuery(text);
      if (from.name) {
        setFrom(EMPTY_SELECTED_ADDRESS);
        resetPricing();
      }
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
    [from.name, resetPricing, searchUserGps],
  );

  const handleDestQueryChange = useCallback(
    (text: string) => {
      setDestQuery(text);
      if (to.name) {
        setTo(EMPTY_SELECTED_ADDRESS);
        resetPricing();
      }
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
    [resetPricing, searchUserGps, to.name],
  );

  const pickFrom = useCallback(
    (loc: GeoLocation) => {
      const check = validateFixpreisRouteLocation(loc, "from");
      if (!check.ok) {
        Alert.alert("Adresse unvollständig", check.message);
        return;
      }
      const addr = geoLocationToSelectedAddress(loc);
      setFrom(addr);
      setOriginQuery(addr.name);
      setOriginResults([]);
      setIsEditingOrigin(false);
      resetPricing();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => destInputRef.current?.focus(), 100);
    },
    [resetPricing],
  );

  const pickTo = useCallback(
    (loc: GeoLocation) => {
      const check = validateFixpreisRouteLocation(loc, "to");
      if (!check.ok) {
        Alert.alert("Adresse unvollständig", check.message);
        return;
      }
      const addr = geoLocationToSelectedAddress(loc);
      setTo(addr);
      setDestQuery(addr.name);
      setDestResults([]);
      setIsEditingOrigin(false);
      resetPricing();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [resetPricing],
  );

  const clearDestQuery = useCallback(() => {
    setDestQuery("");
    setDestResults([]);
    setTo(EMPTY_SELECTED_ADDRESS);
    resetPricing();
  }, [resetPricing]);

  const pickDestinationFavorite = useCallback(
    (fav: SearchFavorite) => {
      pickTo(fav.location);
    },
    [pickTo],
  );

  const openAddFavoriteModal = useCallback(() => {
    if (userDestinationFavorites.length >= MAX_FAVORITES_STORED) {
      Alert.alert(
        "Limit erreicht",
        `Es sind höchstens ${MAX_FAVORITES_STORED} Favoriten möglich.`,
      );
      return;
    }
    setAddFavoriteOpen(true);
  }, [userDestinationFavorites.length]);

  const handleGpsPickup = useCallback(async () => {
    setGpsLoading(true);
    try {
      const fg = await requestForegroundPermissionsSafe();
      if (!fg || fg.status !== "granted") {
        Alert.alert("Standort", "Bitte Standortzugriff erlauben, um den Abholort zu übernehmen.");
        return;
      }
      const pos = await getCurrentPositionSafe({ accuracy: Location.Accuracy.Balanced });
      if (!pos) {
        Alert.alert("Standort", "Standort konnte nicht abgerufen werden.");
        return;
      }
      setSearchUserGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      let geoLoc = await reverseGeocodeCoords(pos.coords.latitude, pos.coords.longitude);
      if (!isGeocodedFixpreisLocation(geoLoc)) {
        const q = [geoLoc.street, geoLoc.housenumber, geoLoc.postcode, geoLoc.city]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (q) {
          const results = await searchLocation(q);
          const match = results.find((loc) => isGeocodedFixpreisLocation(loc));
          if (match) geoLoc = match;
        }
      }
      const check = validateFixpreisRouteLocation(geoLoc, "from");
      if (!check.ok) {
        Alert.alert("Adresse unvollständig", check.message);
        return;
      }
      const addr = geoLocationToSelectedAddress(geoLoc);
      setFrom(addr);
      setOriginQuery(addr.name);
      setOriginResults([]);
      setIsEditingOrigin(false);
      resetPricing();
      Haptics.selectionAsync();
      setTimeout(() => destInputRef.current?.focus(), 100);
    } catch {
      Alert.alert("Standort", "Standort konnte nicht abgerufen werden.");
    } finally {
      setGpsLoading(false);
    }
  }, [resetPricing]);

  const recomputeRouteAndPrice = useCallback(
    async (fromAddr: SelectedAddress, toAddr: SelectedAddress, vehicle: VehicleType) => {
      setRouteLoading(true);
      setEstimateLoading(true);
      setEligible(null);
      setPriceEur(null);
      setBasePriceEur(null);
      setVehicleSurchargeEur(0);
      setIneligibleMessage("");
      const fromFull = fromAddr.fullName || fromAddr.name;
      const toFull = toAddr.fullName || toAddr.name;
      try {
        const cfg = await fetchAppConfig();
        const mandatoryCities = parseFixedPriceMandatoryAreaCities(cfg.tariffs?.fixedPriceMandatoryAreaCities);
        const eligibility = evaluateFixedPriceEligibility({
          from: selectedAddressToFixedPricePoint(fromAddr),
          to: selectedAddressToFixedPricePoint(toAddr),
          mandatoryCities,
        });
        if (!eligibility.eligible) {
          setEligible(false);
          setIneligibleMessage(eligibility.message);
          return;
        }

        const area = await validateServiceAreaForBooking(fromFull, toFull, {
          fromLat: fromAddr.lat,
          fromLon: fromAddr.lon,
          toLat: toAddr.lat,
          toLon: toAddr.lon,
        });
        if (!area.ok) {
          setEligible(false);
          setIneligibleMessage(area.message);
          return;
        }
        const est = await fetchFixedPriceEstimate({
          fromFull,
          toFull,
          fromLat: fromAddr.lat,
          fromLon: fromAddr.lon,
          toLat: toAddr.lat,
          toLon: toAddr.lon,
          fromCity: cityForApi(fromAddr),
          toCity: cityForApi(toAddr),
          vehicle,
        });
        if (!est.ok) {
          setEligible(false);
          setIneligibleMessage(est.message ?? ROUTE_NOT_COMPUTABLE_MESSAGE_DE);
          return;
        }
        if (est.eligible) {
          setDistanceKm(est.distanceKm);
          if (est.durationMinutes != null) setTripMinutes(est.durationMinutes);
        }
        if (!est.eligible) {
          setEligible(false);
          setIneligibleMessage(est.message);
          return;
        }
        setEligible(true);
        setPriceEur(est.priceEur);
        setBasePriceEur(est.basePriceEur);
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
    if (!routeComplete) return;
    void recomputeRouteAndPrice(from, to, selectedVehicle);
  }, [from, to, selectedVehicle, routeComplete, recomputeRouteAndPrice]);

  const scheduleLeadValid = scheduledAt != null && isReservationLeadValid(scheduledAt);
  const minPickupDate = useMemo(() => minimumScheduledPickupDate(), []);

  const surchargeLabel = customerVehicleSurchargeLabel({
    vehicle: selectedVehicle,
    surchargeEur: vehicleSurchargeEur,
  });

  const canSubmit = useMemo(
    () =>
      routeComplete &&
      eligible === true &&
      priceEur != null &&
      priceEur > 0 &&
      agreementAccepted &&
      scheduleLeadValid &&
      !submitting,
    [routeComplete, eligible, priceEur, agreementAccepted, scheduleLeadValid, submitting],
  );

  const handleSubmit = async () => {
    if (!canSubmit || !scheduledAt || priceEur == null) return;
    const fromLoc = selectedAddressToGeoLocation(from);
    const toLoc = selectedAddressToGeoLocation(to);
    const addrCheck = validateFixpreisRouteLocation(fromLoc, "from");
    if (!addrCheck.ok) {
      Alert.alert("Startadresse", addrCheck.message);
      return;
    }
    const toCheck = validateFixpreisRouteLocation(toLoc, "to");
    if (!toCheck.ok) {
      Alert.alert("Zieladresse", toCheck.message);
      return;
    }
    if (!profile.isLoggedIn) {
      Alert.alert("Anmeldung", "Bitte zuerst anmelden, um eine Festpreis-Fahrt zu buchen.");
      return;
    }
    if (!isReservationLeadValid(scheduledAt)) {
      Alert.alert(
        "Termin",
        "Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte einen späteren Zeitpunkt wählen.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const customerName = profile.name?.trim() || "Gast";
      const fromFull = from.fullName || from.name;
      const toFull = to.fullName || to.name;
      const pricingMode = effectivePricingModeForCustomerRide({
        selectedServiceClass: "taxi",
        selectedVehicle,
        origin: fromLoc,
        destination: toLoc,
        bookingFlow: "fixed_price",
      });
      const noteParts = [driverNote.trim(), hasLuggage ? "Gepäck: Ja" : null].filter(Boolean);
      const partnerBookingMeta =
        noteParts.length > 0 ? { partnerBookingMeta: { customer_driver_note: noteParts.join(" · ") } } : {};
      await addRequest({
        from: from.name,
        fromFull,
        fromLat: from.lat,
        fromLon: from.lon,
        fromCity: cityForApi(from),
        to: to.name,
        toFull,
        toLat: to.lat,
        toLon: to.lon,
        toCity: cityForApi(to),
        distanceKm: distanceKm ?? 0,
        durationMinutes: tripMinutes,
        estimatedFare: priceEur,
        paymentMethod: paymentMethod === "cash" ? "Bar" : "Karte",
        vehicle: vehicleLabelForApi(selectedVehicle),
        customerName,
        scheduledAt,
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
      <View
        style={[
          liveStyles.searchHeader,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: "#E5E7EB",
            backgroundColor: "#FFFFFF",
          },
        ]}
      >
        <View style={liveStyles.searchHeaderRow}>
          <Pressable style={liveStyles.backBtn} onPress={exit} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={liveStyles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Festpreis</Text>
          </View>
          <Pressable style={liveStyles.cancelBtn} onPress={exit} hitSlop={10}>
            <Text style={[liveStyles.cancelBtnText, { color: colors.primary }]}>Abbrechen</Text>
          </Pressable>
        </View>

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
          onGpsPress={() => void handleGpsPickup()}
          isSearchingDest={isSearchingDest}
          onClearDest={clearDestQuery}
        />
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          liveStyles.resultsContent,
          { paddingBottom: mainTabScrollPaddingBottom(insets.bottom) },
        ]}
        bottomOffset={insets.bottom + rs(8)}
      >
        {showOriginResults ? (
          <LiveSearchResultGroup
            locations={originResults}
            loading={isSearchingOrigin}
            onPick={pickFrom}
          />
        ) : null}

        {showDestResults ? (
          <LiveSearchResultGroup
            locations={destResults}
            isDestination
            onPick={pickTo}
          />
        ) : null}

        {showDestQuickPicks ? (
          <FixpreisDestinationQuickPicks
            presets={FIXPRICE_DESTINATION_PRESETS}
            userFavorites={userDestinationFavorites}
            activeDisplayName={to.fullName || to.name}
            onPick={pickDestinationFavorite}
            onAddFavorite={openAddFavoriteModal}
            maxFavorites={MAX_FAVORITES_STORED}
          />
        ) : null}

        {showAddressHint ? (
          <Text style={[liveStyles.addressHint, { color: colors.mutedForeground }]}>
            {MESSAGE_FIXPREIS_ADDRESS_REQUIRED_DE}
          </Text>
        ) : null}

        {routeLoading || estimateLoading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Festpreisprüfung …</Text>
          </View>
        ) : null}

        {eligible === false && ineligibleMessage ? (
          <View style={[styles.priceCard, { borderColor: "#FECACA", backgroundColor: "#FEF2F2" }]}>
            <Text style={[styles.priceOk, { color: "#B91C1C" }]}>Kein Festpreis</Text>
            <Text style={[styles.priceMeta, { color: "#7F1D1D" }]}>{ineligibleMessage}</Text>
          </View>
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
            {vehicleSurchargeEur > 0 && basePriceEur != null ? (
              <Text style={[styles.priceBreakdown, { color: colors.mutedForeground }]}>
                {formatEuro(basePriceEur)} Basis + {formatEuro(vehicleSurchargeEur)} Aufschlag
              </Text>
            ) : null}
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

        {routeComplete ? (
          <View style={{ gap: rs(16) }}>
            <View style={[routeStyles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
              <Text style={[routeStyles.sectionTitle, { color: colors.foreground }]}>Termin</Text>
              <Pressable
                style={[routeStyles.dtField, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
                onPress={() => setShowDtPicker(true)}
              >
                <Feather name="calendar" size={18} color="#DC2626" />
                <Text
                  style={[
                    routeStyles.dtFieldText,
                    { color: scheduledAt ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {scheduledAt ? formatBookingDateTime(scheduledAt) : "Datum und Uhrzeit wählen"}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              {!scheduleLeadValid ? (
                <Text style={[styles.leadTimeHint, { color: "#B45309" }]}>
                  Mindestens 60 Minuten Vorlauf. Bitte späteren Zeitpunkt wählen.
                </Text>
              ) : null}
              <View style={[routeStyles.infoBox, { backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM }]}>
                <Feather name="info" size={15} color={colors.mutedForeground} />
                <Text style={[routeStyles.dtNote, { color: colors.mutedForeground, flex: 1 }]}>
                  Alle Zeitangaben basieren auf dem Abholort. Kostenlose Stornierung bis 1 Stunde vor Abholung.
                </Text>
              </View>
            </View>

            <View style={[routeStyles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
              <Text style={[routeStyles.sectionTitle, { color: colors.foreground }]}>Fahrzeug</Text>
              <View style={styles.vehicleRow}>
                {VEHICLES.map((v: VehicleOption) => {
                  const active = selectedVehicle === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.vehicleCard,
                        {
                          borderColor: active ? ONRODA_MARK_RED : colors.border,
                          backgroundColor: active ? `${ONRODA_MARK_RED}0F` : HOME_SHEET_INNER,
                          borderWidth: active ? 2 : 1.5,
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
                          { backgroundColor: active ? "#DC262622" : colors.border + "40" },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={v.icon as any}
                          size={28}
                          color={v.id === "wheelchair" ? NB_WHEELCHAIR_ICON : NB_CAR_ICON}
                        />
                      </View>
                      <Text
                        style={[
                          styles.vehicleName,
                          { color: active ? ONRODA_MARK_RED : colors.foreground },
                        ]}
                        numberOfLines={2}
                      >
                        {v.name}
                      </Text>
                      {active && selectedVehicle !== "standard" && surchargeLabel ? (
                        <Text style={[styles.vehicleSurcharge, { color: ONRODA_MARK_RED }]}>{surchargeLabel}</Text>
                      ) : null}
                      {active ? (
                        <View style={styles.vehicleCheck}>
                          <Feather name="check-circle" size={14} color={ONRODA_MARK_RED} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[routeStyles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
              <Text style={[routeStyles.sectionTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
              <Pressable
                style={[routeStyles.dtField, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
                onPress={() => {
                  setNoteDraft(driverNote);
                  setNoteModal(true);
                }}
              >
                <Feather name="edit-3" size={18} color={colors.mutedForeground} />
                <Text
                  style={[
                    routeStyles.dtFieldText,
                    { color: driverNote.trim() ? colors.foreground : colors.mutedForeground, flex: 1 },
                  ]}
                  numberOfLines={3}
                >
                  {driverNote.trim() ? driverNote : "z. B. Bitte am Haupteingang warten"}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              <View style={styles.luggageRow}>
                <View style={styles.luggageLeft}>
                  <Feather name="briefcase" size={18} color={colors.foreground} />
                  <Text style={[routeStyles.dtFieldText, { color: colors.foreground }]}>Gepäck</Text>
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
          </View>
        ) : null}

        {eligible === true && priceEur != null ? (
          <>
            <View style={[routeStyles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
              <Text style={[routeStyles.sectionTitle, { color: colors.foreground }]}>Zahlungsart</Text>
              <View style={styles.payRow}>
                {(["cash", "card"] as const).map((m) => {
                  const active = paymentMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[
                        styles.payChip,
                        {
                          borderColor: active ? ONRODA_MARK_RED : colors.border,
                          backgroundColor: active ? `${ONRODA_MARK_RED}0F` : HOME_SHEET_INNER,
                          borderWidth: active ? 2 : 1.5,
                        },
                      ]}
                      onPress={() => setPaymentMethod(m)}
                    >
                      <Text style={[styles.payChipText, { color: active ? ONRODA_MARK_RED : colors.foreground }]}>
                        {m === "cash" ? "Bar" : "Karte"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable style={styles.agreeRow} onPress={() => setAgreementAccepted((v) => !v)}>
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

        <CollapsibleBrokerNotice />
      </KeyboardAwareScrollViewCompat>

      <AddSearchFavoriteModal
        visible={addFavoriteOpen}
        onClose={() => setAddFavoriteOpen(false)}
        onSaved={(favorites) => {
          setUserDestinationFavorites(favorites.filter((f) => isGeocodedFixpreisLocation(f.location)));
        }}
        foregroundColor={colors.foreground}
        mutedColor={colors.mutedForeground}
        surfaceColor={colors.surface}
        borderColor={colors.border}
        primaryColor={colors.primary}
        successColor={colors.success}
      />

      <BookingDateTimePicker
        visible={showDtPicker}
        value={scheduledAt}
        minimumDate={minPickupDate}
        onClose={() => setShowDtPicker(false)}
        onConfirm={(d) => {
          setScheduledAt(d);
          setShowDtPicker(false);
        }}
        colors={colors}
      />

      <Modal visible={noteModal} transparent animationType="fade" onRequestClose={() => setNoteModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.modalOverlayInner} onPress={() => setNoteModal(false)}>
            <Pressable
              style={[styles.noteModalCard, { backgroundColor: HOME_SHEET_PANEL }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={[styles.noteModalHeader, { borderBottomColor: HOME_SHEET_RIM }]}>
                <Pressable onPress={() => setNoteModal(false)} hitSlop={10}>
                  <Text style={[styles.noteModalAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
                </Pressable>
                <Text style={[styles.noteModalTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
                <Pressable
                  onPress={() => {
                    setDriverNote(noteDraft.trim());
                    setNoteModal(false);
                    Haptics.selectionAsync();
                  }}
                  hitSlop={10}
                >
                  <Text style={[styles.noteModalAction, { color: HOME_SHEET_TEXT }]}>Fertig</Text>
                </Pressable>
              </View>
              <View style={styles.noteModalBody}>
                <TextInput
                  style={[
                    styles.noteModalInput,
                    { color: colors.foreground, backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM },
                  ]}
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="z. B. Bitte am Haupteingang warten"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  textAlignVertical="top"
                  maxLength={140}
                  autoCorrect
                />
                <Text style={[styles.noteModalCount, { color: colors.mutedForeground }]}>{noteDraft.length}/140</Text>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <BottomTabBar active="buchen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerTitle: accountSheetHeaderTitle,
  leadTimeHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: rs(8), paddingHorizontal: rs(4) },
  vehicleRow: { flexDirection: "row", gap: 10 },
  vehicleCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    minHeight: 110,
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
  vehicleSurcharge: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  vehicleCheck: { position: "absolute", top: 8, right: 8 },
  luggageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(10),
  },
  luggageLeft: { flexDirection: "row", alignItems: "center", gap: rs(10), flex: 1 },
  priceCard: {
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
    alignItems: "center",
  },
  priceOk: { fontFamily: "Inter_700Bold", fontSize: 15 },
  priceBreakdown: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: rs(4) },
  surchargeLine: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 6 },
  priceMeta: { ...accountSheetSecondaryLabel, marginTop: rs(6), textAlign: "center" },
  payRow: { flexDirection: "row", gap: rs(8) },
  payChip: {
    flex: 1,
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
    borderRadius: rs(12),
    alignItems: "center",
  },
  payChipText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  agreeRow: { flexDirection: "row", gap: rs(10), alignItems: "flex-start", paddingHorizontal: rs(4) },
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
    backgroundColor: ONRODA_MARK_RED,
    borderRadius: rs(14),
    paddingVertical: rs(14),
    alignItems: "center",
    marginHorizontal: rs(4),
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#00000055",
    paddingHorizontal: rs(24),
  },
  modalOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  noteModalCard: {
    width: "100%",
    maxWidth: rs(360),
    borderRadius: rs(20),
    overflow: "hidden",
  },
  noteModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noteModalTitle: accountSheetPrimaryLabel,
  noteModalAction: { fontFamily: "Inter_500Medium", fontSize: 15 },
  noteModalBody: {
    paddingHorizontal: rs(16),
    paddingTop: rs(14),
    paddingBottom: rs(16),
    gap: rs(8),
  },
  noteModalInput: {
    minHeight: rs(120),
    maxHeight: rs(160),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
  },
  noteModalCount: { alignSelf: "flex-end", fontSize: 12, fontFamily: "Inter_400Regular" },
});
