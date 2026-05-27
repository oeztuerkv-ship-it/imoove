import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  accountSheetButtonLabel,
  accountSheetCaptionLabel,
  accountSheetCardTitle,
  accountSheetChipLabel,
  accountSheetHeaderTitle,
  accountSheetInputText,
  accountSheetPrimaryLabel,
  accountSheetSecondaryLabel,
  accountSheetToolbarAction,
} from "@/constants/accountSheetTypography";
import { CUSTOMER_BROKER_NOTICE_DE } from "@/constants/customerBrokerNoticeDe";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { effectivePricingModeForCustomerRide, VEHICLES, type VehicleType, type VehicleOption } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import {
  isCompleteStreetAddressForBooking,
  MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
  MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
  userFacingBookingErrorMessage,
  validateAddressCompletenessForBooking,
  validateServiceAreaForBooking,
} from "@/lib/appOperationalConfig";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MedicalTrafficLightCard } from "@/components/MedicalTrafficLightCard";
import { useColors } from "@/hooks/useColors";
import { pickTransportImageBase64 } from "@/utils/medicalScanCapture";
import {
  medicalScanErrorMessageDe,
  postCustomerMedicalTransportScan,
  type MedicalTrafficLight,
} from "@/utils/medicalScanApi";
import { fetchFareEstimatesByVehicle } from "@/utils/fareEstimateApi";
import { getRoute, fetchWithTimeout, searchLocation, type GeoLocation } from "@/utils/routing";
import { rf, rs } from "@/utils/scale";

const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";
const HELP_FIELD_FOCUS = "#111111";
/** Gleiche Fläche wie Sofortfahrt-Suchoverlay (`index.tsx`). */
const SEARCH_OVERLAY_BG = "#FFFFFF";

type NominatimAddress = {
  road?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  amenity?: string;
  attraction?: string;
  aeroway?: string;
  railway?: string;
  public_transport?: string;
};

type GeoResult = {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  class?: string;
  type?: string;
  address?: NominatimAddress;
};

// Soft viewbox bias around Esslingen / Stuttgart (but not exclusive)
const VIEWBOX = "8.8,48.6,9.6,48.9";

async function nominatimSearch(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      addressdetails: "1",
      limit: "6",
      countrycodes: "de",
      viewbox: VIEWBOX,
      bounded: "0",
    });
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" },
        signal,
        timeoutMs: 12_000,
      },
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function shortName(display: string) {
  const parts = display.split(",");
  if (parts.length <= 2) return display.trim();
  return parts.slice(0, 2).join(",").trim();
}

function subName(display: string) {
  const parts = display.split(",");
  return parts.slice(2, 4).join(",").trim();
}

type GeoItem = GeoResult;

type SelectedAddress = {
  name: string;
  subline: string;
  fullName: string;
  lat: number;
  lon: number;
  isStreetAddress: boolean;
  isPoiAddress: boolean;
};

const EMPTY_SELECTED_ADDRESS: SelectedAddress = {
  name: "",
  subline: "",
  fullName: "",
  lat: 0,
  lon: 0,
  isStreetAddress: false,
  isPoiAddress: false,
};

function parseDisplayNameFallback(display: string): { line1: string; subline: string } {
  const parts = String(display ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const plzIdx = parts.findIndex((p) => /^\d{5}$/.test(p));
  const plz = plzIdx >= 0 ? parts[plzIdx] : "";
  const cityPart =
    plzIdx >= 0 && parts[plzIdx + 1] && !/deutschland|baden-württemberg|landkreis|region/i.test(parts[plzIdx + 1])
      ? parts[plzIdx + 1]
      : parts.find(
          (p, i) =>
            i > 0 &&
            !/^\d{5}$/.test(p) &&
            !/\d/.test(p) &&
            !/deutschland|baden-württemberg|landkreis|region/i.test(p),
        ) ?? "";
  const subline = [plz, cityPart].filter(Boolean).join(" ");
  const line1 = (plzIdx > 0 ? parts.slice(0, plzIdx) : parts.slice(0, 1)).join(", ").trim() || parts[0] || "";
  return { line1, subline };
}

function buildStructuredAddressFromGeo(item: GeoItem): {
  name: string;
  subline: string;
  fullName: string;
  isStreetAddress: boolean;
  isPoiAddress: boolean;
} {
  const displayParts = String(item.display_name ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const addr = item.address ?? {};
  const street = typeof addr.road === "string" ? addr.road.trim() : "";
  const house = typeof addr.house_number === "string" ? addr.house_number.trim() : "";
  const postcode = typeof addr.postcode === "string" ? addr.postcode.trim() : "";
  const cityRaw =
    (typeof addr.city === "string" && addr.city.trim()) ||
    (typeof addr.town === "string" && addr.town.trim()) ||
    (typeof addr.village === "string" && addr.village.trim()) ||
    (typeof addr.municipality === "string" && addr.municipality.trim()) ||
    (typeof addr.suburb === "string" && addr.suburb.trim()) ||
    "";
  const cityFromDisplay = displayParts.find(
    (p) =>
      !/\b\d{5}\b/.test(p) &&
      !/\d/.test(p) &&
      !/deutschland|baden-württemberg|landkreis|region/i.test(p),
  );
  const city = String(cityRaw || cityFromDisplay || "").trim();
  const line1Street = street && house ? `${street} ${house}` : street || "";

  const poiLabel =
    (typeof item.name === "string" && item.name.trim()) ||
    (typeof addr.amenity === "string" && addr.amenity.trim()) ||
    (typeof addr.attraction === "string" && addr.attraction.trim()) ||
    (typeof addr.aeroway === "string" && addr.aeroway.trim()) ||
    (typeof addr.railway === "string" && addr.railway.trim()) ||
    shortName(item.display_name);
  const poiText = String(poiLabel || "").trim();
  const poiKeyword = /(flughafen|bahnhof|station|terminal|haltestelle|messe|klinik|hotel|zentrum|gvv)/i.test(poiText);
  const poiClass = /^(aeroway|railway|amenity|tourism|leisure|public_transport)$/i.test(String(item.class ?? ""));
  const isPoiAddress = (!line1Street && (poiKeyword || poiClass)) || /^(station|stop|platform|terminal)$/i.test(String(item.type ?? ""));

  let line1 = line1Street || poiText;
  let subline = [postcode, city].filter(Boolean).join(" ");

  if (!subline || (!line1 && !poiText)) {
    const fallback = parseDisplayNameFallback(item.display_name);
    if (!line1) line1 = fallback.line1;
    if (!subline) subline = fallback.subline;
  }

  const fullName = subline ? `${line1}, ${subline}` : line1;
  return {
    name: line1,
    subline,
    fullName,
    isStreetAddress: Boolean(street && house),
    isPoiAddress,
  };
}

function plzCitySubline(loc: GeoLocation, displayParts: string[]): string {
  const plz =
    loc.postcode?.trim() ||
    displayParts.find((p) => /^\d{5}$/.test(p)) ||
    "";
  const city =
    loc.city?.trim() ||
    displayParts.find(
      (p, i) =>
        i > 0 &&
        !/^\d{5}$/.test(p) &&
        !/\d/.test(p) &&
        !/deutschland|germany|baden-württemberg|landkreis|region/i.test(p),
    ) ||
    "";
  return [plz, city].filter(Boolean).join(" ");
}

function geoLocationToSelectedAddress(loc: GeoLocation): SelectedAddress {
  const parts = loc.displayName.split(",").map((p) => p.trim()).filter(Boolean);
  const street = loc.street?.trim() ?? "";
  const house = loc.housenumber?.trim() ?? "";
  let name = (parts[0] ?? loc.displayName).trim();
  if (street) {
    name = house ? `${street} ${house}` : street;
  }
  const subline = plzCitySubline(loc, parts) || parts.slice(1, 3).join(", ").trim();
  const fullName = subline ? `${name}, ${subline}` : loc.displayName;
  const hasHouse =
    Boolean(house) || /\b\d{1,5}[a-z]?(?:\s*[-/]\s*\d{1,5}[a-z]?)?\b/i.test(name);
  const hasCity = Boolean(loc.city?.trim() || subline);
  const isPoiAddress = !hasHouse || !hasCity;
  return {
    name,
    subline,
    fullName,
    lat: loc.lat,
    lon: loc.lon,
    isStreetAddress: !isPoiAddress,
    isPoiAddress,
  };
}

function selectedAddressIsBookingComplete(addr: SelectedAddress): boolean {
  return isCompleteStreetAddressForBooking({
    fullName: addr.fullName || addr.name,
    subline: addr.subline,
    isPoiAddress: addr.isPoiAddress,
  });
}

async function reverseGeocodeLatLon(lat: number, lon: number): Promise<SelectedAddress | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "json",
      addressdetails: "1",
    });
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" },
        timeoutMs: 12_000,
      },
    );
    if (!res.ok) return null;
    const item = (await res.json()) as GeoItem;
    const structured = buildStructuredAddressFromGeo(item);
    return {
      ...structured,
      lat,
      lon,
    };
  } catch {
    return null;
  }
}

function AddressInput({
  label = "",
  value,
  subline,
  placeholder,
  onSelect,
  colors,
  compact = false,
  routeRow = false,
  taxiRoute = false,
  fieldLabel,
  showGps = false,
  onGpsPress,
  gpsLoading = false,
  inputAccessoryViewID,
  onRouteFocus,
  onRouteClear,
  userGps,
  onAfterSelect,
  showClear = false,
  isDestination = false,
  inputRef: externalInputRef,
}: {
  label?: string;
  value: string;
  subline: string;
  placeholder: string;
  onSelect: (selection: SelectedAddress) => void;
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
  routeRow?: boolean;
  taxiRoute?: boolean;
  fieldLabel?: string;
  showGps?: boolean;
  onGpsPress?: () => void;
  gpsLoading?: boolean;
  inputAccessoryViewID?: string;
  onRouteFocus?: () => void;
  onRouteClear?: () => void;
  userGps?: { lat: number; lon: number } | null;
  onAfterSelect?: () => void;
  showClear?: boolean;
  isDestination?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const [query, setQuery] = useState(value);
  const [nominatimResults, setNominatimResults] = useState<GeoItem[]>([]);
  const [photonResults, setPhotonResults] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const localInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? localInputRef;

  useEffect(() => {
    if (!value.trim()) {
      setQuery("");
      return;
    }
    if (taxiRoute) {
      if (!focused) return;
      setQuery(value);
      return;
    }
    const next = subline ? `${value}, ${subline}` : value;
    if (!focused) setQuery(next);
  }, [focused, value, subline, taxiRoute]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  const showPhotonResults = taxiRoute && focused && query.length >= 2;
  const showNominatimResults = !taxiRoute && focused && nominatimResults.length > 0 && query.length >= 2;

  const dismissEdit = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setFocused(false);
    setNominatimResults([]);
    setPhotonResults([]);
  };

  const enterEditMode = () => {
    setQuery(taxiRoute ? value : subline ? `${value}, ${subline}` : value);
    setFocused(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setNominatimResults([]);
    setPhotonResults([]);
    if (text.length === 0) {
      onSelect(EMPTY_SELECTED_ADDRESS);
    }
    if (debounce.current) clearTimeout(debounce.current);
    if (text.length < 2) {
      setLoading(false);
      return;
    }
    if (taxiRoute) {
      setLoading(true);
      debounce.current = setTimeout(async () => {
        try {
          const locs = await searchLocation(text, userGps ?? undefined);
          setPhotonResults(locs.slice(0, isDestination ? 6 : 5));
        } catch {
          setPhotonResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
      return;
    }
    debounce.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setLoading(true);
      try {
        const r = await nominatimSearch(text, ac.signal);
        if (!ac.signal.aborted) setNominatimResults(r);
      } finally {
        if (searchAbortRef.current === ac) setLoading(false);
      }
    }, 350);
  };

  const handlePick = (selection: SelectedAddress) => {
    if (!selectedAddressIsBookingComplete(selection)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Adresse unvollständig", MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE);
      return;
    }
    setQuery(selection.name);
    setNominatimResults([]);
    setPhotonResults([]);
    setFocused(false);
    inputRef.current?.blur();
    onSelect(selection);
    Haptics.selectionAsync();
    onAfterSelect?.();
  };

  const handlePhotonPick = (loc: GeoLocation) => {
    handlePick(geoLocationToSelectedAddress(loc));
  };

  const hasSelection = value.trim().length > 0;
  /** taxiRoute: Straße+Nr. / PLZ+Stadt zweizeilig; sonst Preview wie bisher. */
  const showSelectedPreview =
    hasSelection && !focused && (taxiRoute || compact || routeRow);
  const FieldShell = showSelectedPreview ? Pressable : View;

  const handleClear = () => {
    searchAbortRef.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    setQuery("");
    setNominatimResults([]);
    setPhotonResults([]);
    setLoading(false);
    onSelect(EMPTY_SELECTED_ADDRESS);
    onRouteClear?.();
  };

  const handleClearAndDismiss = () => {
    handleClear();
    dismissEdit();
  };

  const fieldBorder = focused ? HELP_FIELD_FOCUS : HOME_SHEET_RIM;
  const fieldBorderWidth = focused ? 1.5 : StyleSheet.hairlineWidth;

  const showGpsBtn = routeRow && showGps && (taxiRoute || (!focused && !hasSelection && !loading));
  const showClearBtn = taxiRoute && showClear && focused && query.length > 0 && !loading;
  const showDestSpinner = taxiRoute && isDestination && loading;
  const showRouteEditActions = routeRow && focused && !taxiRoute;

  return (
    <>
      {Platform.OS === "ios" && inputAccessoryViewID && !taxiRoute ? (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View style={[styles.accessoryBar, { borderTopColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={dismissEdit} hitSlop={10}>
              <Text style={styles.accessoryDone}>Fertig</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    <View
      style={[
        routeRow ? styles.routeRowWrap : undefined,
        routeRow && focused && !taxiRoute ? styles.routeRowWrapFocused : null,
      ]}
    >
      {!compact && !routeRow ? (
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      ) : null}
      <FieldShell
        style={[
          routeRow ? styles.routeRowPress : styles.inputBox,
          !routeRow && compact && styles.inputBoxRoute,
          routeRow && focused && styles.routeRowEditing,
          !routeRow && {
            backgroundColor: HOME_SHEET_INNER,
            borderColor: fieldBorder,
            borderWidth: fieldBorderWidth,
          },
          routeRow && taxiRoute && {
            backgroundColor: "transparent",
            borderColor: focused ? fieldBorder : "transparent",
            borderWidth: focused ? fieldBorderWidth : 0,
          },
          routeRow && !taxiRoute && {
            backgroundColor: focused || showSelectedPreview ? "#FFFFFF" : "transparent",
            borderColor: focused ? fieldBorder : showSelectedPreview ? HOME_SHEET_RIM : "transparent",
            borderWidth: focused ? fieldBorderWidth : showSelectedPreview ? StyleSheet.hairlineWidth : 0,
          },
        ]}
        {...(showSelectedPreview
          ? {
              onPress: () => {
                enterEditMode();
              },
            }
          : {})}
      >
        <View style={[routeRow ? styles.routeRowBody : styles.inputBody, routeRow ? styles.routeRowBodyGrow : null]}>
          {routeRow && fieldLabel ? (
            <Text style={[styles.routeRowCaption, { color: colors.mutedForeground }]}>{fieldLabel}</Text>
          ) : null}
          {showSelectedPreview ? (
            <View style={[styles.addressPreview, routeRow && styles.routeAddressPreview]}>
              <Text
                style={[
                  routeRow ? styles.routeAddressLine1 : styles.addressLine1,
                  { color: colors.foreground },
                ]}
                numberOfLines={2}
              >
                {value}
              </Text>
              {subline ? (
                <Text
                  style={[
                    routeRow ? styles.routeAddressLine2 : styles.addressLine2,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {subline}
                </Text>
              ) : null}
            </View>
          ) : (
            <TextInput
              ref={inputRef}
              style={[
                styles.inputText,
                routeRow && styles.routeRowInput,
                compact && !routeRow && styles.inputTextRoute,
                { color: colors.foreground },
              ]}
              value={query}
              onChangeText={handleChange}
              onFocus={() => {
                setFocused(true);
                onRouteFocus?.();
              }}
              onBlur={() => {
                setTimeout(() => setFocused(false), 200);
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="words"
              inputAccessoryViewID={
                Platform.OS === "ios" && inputAccessoryViewID && !taxiRoute ? inputAccessoryViewID : undefined
              }
            />
          )}
        </View>
        {loading && !taxiRoute ? (
          <ActivityIndicator size="small" color={colors.foreground} style={styles.routePreviewTrailing} />
        ) : null}
        {showGpsBtn && onGpsPress ? (
          <Pressable hitSlop={8} onPress={onGpsPress} style={taxiRoute ? styles.liveGpsIconBtn : styles.routeGpsBtn}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="navigation" size={taxiRoute ? 15 : 17} color={colors.primary} />
            )}
          </Pressable>
        ) : null}
        {showDestSpinner ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        {showClearBtn ? (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {showRouteEditActions && taxiRoute ? (
          <View style={styles.routeEditActionsInline}>
            <Pressable
              hitSlop={8}
              onPress={handleClearAndDismiss}
              style={({ pressed }) => [styles.routeIconBtn, { borderColor: HOME_SHEET_RIM, opacity: pressed ? 0.65 : 1 }]}
              accessibilityLabel="Adresse leeren"
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={dismissEdit}
              style={({ pressed }) => [styles.routeIconBtn, styles.routeIconBtnDone, { opacity: pressed ? 0.85 : 1 }]}
              accessibilityLabel="Fertig"
            >
              <Feather name="check" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
        {routeRow && showSelectedPreview && !showRouteEditActions ? (
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.routePreviewTrailing} />
        ) : null}
      </FieldShell>
      {showRouteEditActions && !taxiRoute ? (
        <View style={styles.routeEditBarBelow}>
          <View style={styles.routeEditActions}>
            <Pressable hitSlop={8} onPress={handleClearAndDismiss} style={({ pressed }) => [styles.routeIconBtn, { borderColor: HOME_SHEET_RIM, opacity: pressed ? 0.65 : 1 }]}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable hitSlop={8} onPress={dismissEdit} style={({ pressed }) => [styles.routeIconBtn, styles.routeIconBtnDone, { opacity: pressed ? 0.85 : 1 }]}>
              <Feather name="check" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Photon (Sofortfahrt / Reservieren — wie Startseiten-Suche) */}
      {showPhotonResults ? (
        <View style={[styles.liveResultGroup, { borderColor: colors.border, marginTop: rs(4) }]}>
          {loading && photonResults.length === 0 ? (
            <View style={styles.liveSearchingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.liveSearchingText, { color: colors.mutedForeground }]}>Suche läuft...</Text>
            </View>
          ) : (
            photonResults.map((loc, i) => {
              const structured = geoLocationToSelectedAddress(loc);
              return (
                <React.Fragment key={`${loc.lat}-${loc.lon}-${i}`}>
                  {i > 0 ? <View style={[styles.liveResultDivider, { backgroundColor: colors.border }]} /> : null}
                  <Pressable
                    style={({ pressed }) => [styles.liveResultRow, pressed && { backgroundColor: colors.muted }]}
                    onPress={() => handlePhotonPick(loc)}
                  >
                    <View
                      style={[
                        styles.liveResultIcon,
                        { backgroundColor: isDestination ? colors.muted : "#F0F9FF" },
                      ]}
                    >
                      <Feather name="map-pin" size={15} color={isDestination ? colors.primary : "#3B82F6"} />
                    </View>
                    <View style={styles.liveResultText}>
                      <Text style={[styles.liveResultTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {structured.name}
                      </Text>
                      <Text style={[styles.liveResultSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {structured.subline || loc.displayName.split(",").slice(1, 3).join(",").trim()}
                      </Text>
                    </View>
                  </Pressable>
                </React.Fragment>
              );
            })
          )}
        </View>
      ) : null}

      {/* Nominatim (Legacy-Felder) */}
      {showNominatimResults ? (
        <View
          style={[
            styles.suggestionBox,
            { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" },
          ]}
        >
          {nominatimResults.map((s, i) => (
            <Pressable
              key={i}
              style={[
                styles.suggestionItem,
                i < nominatimResults.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: HOME_SHEET_RIM,
                },
              ]}
              onPress={() => {
                const structured = buildStructuredAddressFromGeo(s);
                handlePick({
                  name: structured.name,
                  subline: structured.subline,
                  fullName: structured.fullName,
                  lat: parseFloat(s.lat),
                  lon: parseFloat(s.lon),
                  isStreetAddress: structured.isStreetAddress,
                  isPoiAddress: structured.isPoiAddress,
                });
              }}
            >
              <View style={[styles.suggestionIconBox, { backgroundColor: colors.muted }]}>
                <Feather name="map-pin" size={13} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                {(() => {
                  const structured = buildStructuredAddressFromGeo(s);
                  return (
                    <>
                      <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={1}>
                        {structured.name}
                      </Text>
                      <Text style={[styles.suggestionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {structured.subline || subName(s.display_name)}
                      </Text>
                    </>
                  );
                })()}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
    </>
  );
}

function pad(n: number) { return n.toString().padStart(2, "0"); }

function BookingDateTimePicker({
  visible,
  value,
  onClose,
  onConfirm,
  colors,
}: {
  visible: boolean;
  value: Date | null;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const minDate = new Date();
  const [draft, setDraft] = useState(value ?? minDate);

  useEffect(() => {
    if (visible) setDraft(value ?? minDate);
  }, [visible, value]);

  const onChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (next) setDraft(next);
  };

  const confirm = () => {
    onConfirm(draft);
    Haptics.selectionAsync();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dtModalOverlay} onPress={onClose}>
        <Pressable style={styles.dtModalOverlayInner} onPress={(e) => e.stopPropagation()}>
          <Pressable style={[styles.dtModalCard, { backgroundColor: HOME_SHEET_PANEL }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.dtSheetHeader, { borderBottomColor: HOME_SHEET_RIM }]}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.dtSheetAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
            </Pressable>
            <Text style={[styles.dtSheetTitle, { color: colors.foreground }]}>Abholzeit</Text>
            <Pressable onPress={confirm} hitSlop={10}>
              <Text style={[styles.dtSheetAction, { color: HOME_SHEET_TEXT }]}>Fertig</Text>
            </Pressable>
          </View>
          <RNDateTimePicker
            value={draft}
            mode="datetime"
            display="spinner"
            is24Hour
            locale="de-DE"
            minimumDate={minDate}
            onChange={onChange}
            style={styles.dtSpinner}
            textColor={colors.foreground}
          />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DriverNoteModal({
  visible,
  value,
  onClose,
  onConfirm,
  colors,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    inputRef.current?.blur();
    return undefined;
  }, [visible, value]);

  const confirm = () => {
    onConfirm(draft.trim());
    Haptics.selectionAsync();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.dtModalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.dtModalOverlayInner} onPress={onClose}>
          <Pressable
            style={[styles.dtModalCard, styles.driverNoteModalCard, { backgroundColor: HOME_SHEET_PANEL }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.dtSheetHeader, { borderBottomColor: HOME_SHEET_RIM }]}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={[styles.dtSheetAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
              </Pressable>
              <Text style={[styles.dtSheetTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
              <Pressable onPress={confirm} hitSlop={10}>
                <Text style={[styles.dtSheetAction, { color: HOME_SHEET_TEXT }]}>Fertig</Text>
              </Pressable>
            </View>
            <View style={styles.driverNoteModalBody}>
              <TextInput
                ref={inputRef}
                style={[
                  styles.driverNoteModalInput,
                  { color: colors.foreground, backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM },
                ]}
                value={draft}
                onChangeText={setDraft}
                placeholder="z. B. Bitte am Haupteingang warten"
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
                maxLength={140}
                autoCorrect
              />
              <Text style={[styles.driverNoteModalCount, { color: colors.mutedForeground }]}>
                {draft.length}/140
              </Text>
              <Text style={[styles.driverNoteHint, { color: colors.mutedForeground }]}>
                Optional — nur für den Fahrer sichtbar.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function formatDateTime(d: Date) {
  const datePart = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  return `${datePart}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

export default function NewBookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;

  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const { addRequest, passengerId } = useRideRequests();
  const { profile } = useUser();
  const { config: appCfg } = useOnrodaAppConfig();
  const medicalTransportAvailable = appCfg.medicalTransportAvailable === true;
  const brokerNoticeDe =
    (typeof appCfg.system?.globalNoticeDe === "string" ? appCfg.system.globalNoticeDe.trim() : "") ||
    CUSTOMER_BROKER_NOTICE_DE;

  const [from, setFrom] = useState<SelectedAddress>(EMPTY_SELECTED_ADDRESS);
  const [to, setTo] = useState<SelectedAddress>(EMPTY_SELECTED_ADDRESS);
  const isInstant = mode === "instant";
  const [scheduledAt, setScheduledAt] = useState<Date | null>(isInstant ? new Date() : null);
  const [showDtPicker, setShowDtPicker] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("standard");
  const [accessCode, setAccessCode] = useState("");
  const [driverNote, setDriverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fareEstimates, setFareEstimates] = useState<Record<string, number | null>>({});
  const [fareLoading, setFareLoading] = useState(false);
  const [wheelchairFoldable, setWheelchairFoldable] = useState(false);
  const [wheelchairCompanion, setWheelchairCompanion] = useState(false);
  const [showDriverNoteModal, setShowDriverNoteModal] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [medicalRideEnabled, setMedicalRideEnabled] = useState(false);
  const [transportScanBusy, setTransportScanBusy] = useState(false);
  const [pendingTransportScanId, setPendingTransportScanId] = useState<string | null>(null);
  const [transportScanTrafficLight, setTransportScanTrafficLight] = useState<MedicalTrafficLight | null>(null);
  const [transportScanReasonDe, setTransportScanReasonDe] = useState<string | null>(null);

  const dismissTransportScan = useCallback(() => {
    setPendingTransportScanId(null);
    setTransportScanTrafficLight(null);
    setTransportScanReasonDe(null);
  }, []);

  const switchMedicalToBar = useCallback(() => {
    setMedicalRideEnabled(false);
    dismissTransportScan();
    Haptics.selectionAsync();
  }, [dismissTransportScan]);

  const [searchUserGps, setSearchUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const originAddressInputRef = useRef<TextInput>(null);
  const destAddressInputRef = useRef<TextInput>(null);

  const exitBookingScreen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/" as Href);
  }, []);

  const dismissBookingKeyboard = useCallback(() => {
    originAddressInputRef.current?.blur();
    destAddressInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const openDriverNoteModal = useCallback(() => {
    dismissBookingKeyboard();
    setShowDriverNoteModal(true);
  }, [dismissBookingKeyboard]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setSearchUserGps({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const focusDestAddressField = useCallback(() => {
    originAddressInputRef.current?.blur();
    setTimeout(() => destAddressInputRef.current?.focus(), 150);
  }, []);

  const handleGpsPickup = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Standort", "Bitte Standortzugriff erlauben, um den Abholort zu übernehmen.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setSearchUserGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      const picked = await reverseGeocodeLatLon(pos.coords.latitude, pos.coords.longitude);
      if (picked?.name.trim()) {
        setFrom(picked);
        Haptics.selectionAsync();
        focusDestAddressField();
      } else {
        Alert.alert("Standort", "Adresse konnte nicht ermittelt werden.");
      }
    } catch {
      Alert.alert("Standort", "Standort konnte nicht abgerufen werden.");
    } finally {
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    setFrom(EMPTY_SELECTED_ADDRESS);
    setTo(EMPTY_SELECTED_ADDRESS);
    setScheduledAt(null);
    setSelectedVehicle("standard");
    setAccessCode("");
    setDriverNote("");
    setFareEstimates({});
    setMedicalRideEnabled(false);
    dismissTransportScan();
  }, [dismissTransportScan]);

  const formComplete =
    selectedAddressIsBookingComplete(from) &&
    selectedAddressIsBookingComplete(to) &&
    (isInstant || scheduledAt !== null);

  const canSubmitReservation = useMemo(() => {
    if (!formComplete || submitting) return false;
    if (!medicalRideEnabled) return true;
    if (!pendingTransportScanId || !transportScanTrafficLight) return false;
    return transportScanTrafficLight === "green" || transportScanTrafficLight === "yellow";
  }, [
    formComplete,
    submitting,
    medicalRideEnabled,
    pendingTransportScanId,
    transportScanTrafficLight,
  ]);

  const submitButtonLabel = useMemo(() => {
    if (submitting) return "Wird gesendet…";
    if (medicalRideEnabled && transportScanTrafficLight === "yellow") return "Trotzdem buchen";
    return "Reservierung absenden";
  }, [submitting, medicalRideEnabled, transportScanTrafficLight]);

  async function runTransportScan(fromCamera: boolean) {
    const token = profile.sessionToken?.trim() ?? "";
    if (!token) {
      Alert.alert("Anmeldung", "Bitte zuerst anmelden, um den Transportschein zu scannen.");
      return;
    }
    setTransportScanBusy(true);
    try {
      const imageBase64 = await pickTransportImageBase64(fromCamera, { maxWidth: 1280, jpegQuality: 0.62 });
      if (!imageBase64) return;
      const result = await postCustomerMedicalTransportScan({ authToken: token, imageBase64 });
      if (!result.ok) {
        Alert.alert("Transportschein", medicalScanErrorMessageDe(result.error));
        return;
      }
      setPendingTransportScanId(result.scanId);
      setTransportScanTrafficLight(result.trafficLight);
      setTransportScanReasonDe(result.primaryReasonDe);
      Haptics.notificationAsync(
        result.trafficLight === "green"
          ? Haptics.NotificationFeedbackType.Success
          : result.trafficLight === "red"
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (e) {
      Alert.alert("Transportschein", e instanceof Error ? e.message : "Scan fehlgeschlagen.");
    } finally {
      setTransportScanBusy(false);
    }
  }

  function openTransportScanPicker() {
    if (Platform.OS === "web") {
      Alert.alert("Transportschein", "Bitte in der nativen App (iOS/Android) scannen.");
      return;
    }
    Alert.alert("Transportschein scannen", "Foto des Transportscheins für die Vorprüfung", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Foto aufnehmen", onPress: () => void runTransportScan(true) },
      { text: "Aus Galerie", onPress: () => void runTransportScan(false) },
    ]);
  }

  useEffect(() => {
    if (!from.lat || !from.lon || !to.lat || !to.lon) {
      setFareEstimates({});
      return;
    }

    let cancelled = false;
    setFareLoading(true);

    (async () => {
      try {
        const route = await getRoute(
          { lat: from.lat!, lon: from.lon!, displayName: from.fullName || from.name },
          { lat: to.lat!, lon: to.lon!, displayName: to.fullName || to.name },
        );

        const estimates = await fetchFareEstimatesByVehicle(["standard", "xl", "wheelchair"], {
          distanceKm: route.distanceKm,
          tripMinutes: route.durationMinutes,
          fromFull: from.fullName || from.name,
          fromLat: from.lat!,
          fromLon: from.lon!,
          toFull: to.fullName || to.name,
        });
        const results = ["standard", "xl", "wheelchair"].map(
          (vehicle) => [vehicle, estimates.get(vehicle) ?? null] as [string, number | null],
        );

        if (!cancelled) setFareEstimates(Object.fromEntries(results));
      } finally {
        if (!cancelled) setFareLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [from.lat, from.lon, from.fullName, from.name, to.lat, to.lon, to.fullName, to.name]);
  function accessCodeErrorMessage(code: string): string {
    const m: Record<string, string> = {
      pickup_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
      ride_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
      address_house_number_required: MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
      accessibility_options_required_for_wheelchair: "Bitte Rollstuhl-Details vollständig angeben.",
      accessibility_options_invalid: "Rollstuhl-Details sind unvollständig oder ungültig.",
      access_code_invalid: "Der eingegebene Code ist ungültig oder unbekannt.",
      access_code_inactive: "Dieser Code ist deaktiviert.",
      access_code_not_yet_valid:
        "Dieser Code ist noch nicht gültig. Bitte erst ab dem gültigen Beginn buchen (siehe Partner-Freigabe).",
      access_code_expired: "Dieser Code ist abgelaufen.",
      access_code_exhausted: "Dieser Code wurde bereits vollständig eingelöst.",
      access_code_wrong_company: "Dieser Code passt nicht zu dieser Buchung.",
      reservation_lead_time_too_short:
        "Zeit zu knapp. Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte buche eine Sofortfahrt.",
      request_failed: "Die Buchung konnte nicht gesendet werden.",
      medical_transport_scan_required: "Bitte zuerst den Transportschein scannen.",
      medical_transport_scan_rejected:
        "Transportschein abgelehnt. Bitte erneut scannen oder ohne Krankenkasse (Bar) buchen.",
    };
    return m[code] ?? "Die Buchung ist fehlgeschlagen. Bitte erneut versuchen.";
  }

  const handleSubmit = async () => {
    if (!formComplete || submitting) return;
    setSubmitting(true);
    const vehicleApiValue = selectedVehicle;
    const customerName = profile?.name
      ? profile.name.split(" ")[0] + " " + (profile.name.split(" ")[1]?.[0] ?? "") + "."
      : "Gast";
    const codeTrim = accessCode.trim();
    const originGeo: GeoLocation = {
      lat: from.lat,
      lon: from.lon,
      displayName: from.fullName || from.name,
    };
    const destGeo: GeoLocation = {
      lat: to.lat,
      lon: to.lon,
      displayName: to.fullName || to.name,
    };
    const pricingMode = effectivePricingModeForCustomerRide({
      selectedServiceClass: "taxi",
      selectedVehicle,
      origin: originGeo,
      destination: destGeo,
    });
    const fromFull = from.fullName || from.name;
    const toFull = to.fullName || to.name;
    try {
      const readCoord = (
        obj: unknown,
        primary: "lat" | "lon",
        fallback: "latitude" | "longitude",
      ): number | null => {
        if (!obj || typeof obj !== "object") return null;
        const raw = (obj as Record<string, unknown>)[primary] ?? (obj as Record<string, unknown>)[fallback];
        const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
        return Number.isFinite(n) ? n : null;
      };

      const originLat = readCoord(from as unknown, "lat", "latitude");
      const originLon = readCoord(from as unknown, "lon", "longitude");
      const destinationLat = readCoord(to as unknown, "lat", "latitude");
      const destinationLon = readCoord(to as unknown, "lon", "longitude");

      const hasGeoSelection =
        originLat != null &&
        originLon != null &&
        destinationLat != null &&
        destinationLon != null;

      if (!hasGeoSelection) {
        const addressCheck = validateAddressCompletenessForBooking(fromFull, toFull, {
          fromSubline: from.subline,
          toSubline: to.subline,
          fromPoi: from.isPoiAddress,
          toPoi: to.isPoiAddress,
        });
        if (!addressCheck.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Buchung nicht möglich", addressCheck.message);
          return;
        }
      }
      const fromLooksValid = from.isStreetAddress || from.isPoiAddress;
      const toLooksValid = to.isStreetAddress || to.isPoiAddress;
      if (!fromLooksValid || !toLooksValid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Buchung nicht möglich",
          "Bitte wählen Sie eine vollständige Adresse (Straße + Hausnummer) oder einen eindeutigen POI-Vorschlag.",
        );
        return;
      }
      const area = await validateServiceAreaForBooking(fromFull, toFull, {
        fromLat: originLat,
        fromLon: originLon,
        toLat: destinationLat,
        toLon: destinationLon,
      });
      if (!area.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Buchung nicht möglich", area.message);
        return;
      }
      const bookingRoute = await getRoute(
        { lat: originLat!, lon: originLon!, displayName: fromFull },
        { lat: destinationLat!, lon: destinationLon!, displayName: toFull },
      );

      const partnerBookingMeta: Record<string, unknown> = {};
      if (driverNote.trim()) partnerBookingMeta.customer_driver_note = driverNote.trim();
      if (medicalRideEnabled) partnerBookingMeta.medical_ride = true;

      await addRequest({
        from: from.name,
        fromFull,
        fromLat: originLat ?? undefined,
        fromLon: originLon ?? undefined,
        to: to.name,
        toFull,
        toLat: destinationLat ?? undefined,
        toLon: destinationLon ?? undefined,
        distanceKm: bookingRoute.distanceKm,
        durationMinutes: bookingRoute.durationMinutes,
        estimatedFare: fareEstimates[selectedVehicle] ?? 0,
        paymentMethod: medicalRideEnabled ? "Krankenkasse" : "Bar",
        vehicle: vehicleApiValue,
        customerName,
        passengerId: passengerId || undefined,
        scheduledAt: isInstant ? null : scheduledAt,
        rideKind: medicalRideEnabled ? "medical" : "standard",
        payerKind: medicalRideEnabled ? "insurance" : "passenger",
        ...(pricingMode ? { pricingMode } : {}),
        ...(Object.keys(partnerBookingMeta).length > 0 ? { partnerBookingMeta } : {}),
        ...(medicalRideEnabled && pendingTransportScanId
          ? { customerMedicalScanId: pendingTransportScanId }
          : {}),
        ...(codeTrim ? { accessCode: codeTrim } : {}),
        ...(profile.billingType === "company" && profile.costCenter.trim()
          ? { billingReference: profile.costCenter.trim() }
          : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/my-rides");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Buchung", userFacingBookingErrorMessage(e, accessCodeErrorMessage));
    } finally {
      setSubmitting(false);
    }
  };

  const renderCustomerBrokerNotice = () => (
      <View
        style={[
          styles.brokerNoticeBox,
          {
            backgroundColor: "#F0FDFA",
            borderColor: "#99F6E4",
          },
          Platform.select({
            ios: {
              shadowColor: "#0F766E",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 6,
            },
            android: { elevation: 3 },
            default: {},
          }),
        ]}
      >
        <MaterialCommunityIcons name="information-outline" size={20} color="#0D9488" style={{ marginTop: 1 }} />
        <Text style={[styles.brokerNoticeText, { color: colors.foreground }]}>{brokerNoticeDe}</Text>
      </View>
  );

  const renderRouteAddressCard = () => (
    <View style={[styles.routeAddressCard, { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }]}>
      <View style={styles.fahrzielRoute}>
        <View style={styles.fahrzielTimeline} pointerEvents="none">
          <View style={styles.fahrzielDotOrigin} />
          <View style={[styles.fahrzielConnector, { backgroundColor: colors.border }]} />
          <View style={[styles.fahrzielDotDest, { backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.fahrzielFieldsCol}>
          <AddressInput
            routeRow
            taxiRoute
            showGps
            userGps={searchUserGps}
            inputRef={originAddressInputRef}
            onGpsPress={() => void handleGpsPickup()}
            gpsLoading={gpsLoading}
            value={from.name}
            subline={from.subline}
            placeholder="Startadresse eingeben..."
            onSelect={setFrom}
            onAfterSelect={focusDestAddressField}
            colors={colors}
          />
          <View style={[styles.fahrzielFieldSep, { backgroundColor: colors.border }]} />
          <AddressInput
            routeRow
            taxiRoute
            showClear
            isDestination
            userGps={searchUserGps}
            inputRef={destAddressInputRef}
            value={to.name}
            subline={to.subline}
            placeholder="Ziel eingeben..."
            onSelect={setTo}
            colors={colors}
          />
        </View>
      </View>
    </View>
  );

  const renderBookingFormSections = () => (
    <>
        <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
          {!isInstant && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Termin</Text>
              <Pressable
                style={[styles.dtField, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
                onPress={() => setShowDtPicker(true)}
              >
                <Feather name="calendar" size={18} color="#DC2626" />
                <Text style={[styles.dtFieldText, { color: scheduledAt ? colors.foreground : colors.mutedForeground }]}>
                  {scheduledAt ? formatDateTime(scheduledAt) : "Datum und Uhrzeit wählen"}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </>
          )}
          {isInstant && (
            <View style={[styles.instantBadge, { backgroundColor: "#DCFCE7", borderColor: "#BBF7D0" }]}>
              <Feather name="zap" size={15} color="#16A34A" />
              <Text style={styles.instantBadgeText}>Sofort – Fahrer wird gesucht</Text>
            </View>
          )}
          <View style={[styles.infoBox, { backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM }]}>
            <Feather name="info" size={15} color={colors.mutedForeground} />
            <Text style={[styles.dtNote, { color: colors.mutedForeground, flex: 1 }]}>
              Alle Zeitangaben basieren auf dem Abholort. Kostenlose Stornierung bis 1 Stunde vor Abholung.
            </Text>
          </View>
        </View>

        <View style={[styles.card, styles.driverNoteCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
          <View style={styles.driverNoteSectionTitleRow}>
            <Text style={[styles.driverNoteSectionTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
            {driverNote.trim().length > 0 ? (
              <Feather name="check-circle" size={20} color="#16A34A" accessibilityLabel="Notiz wird mitgeschickt" />
            ) : null}
          </View>
          <Pressable
            style={[styles.dtField, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
            onPress={openDriverNoteModal}
          >
            <Feather name="edit-3" size={18} color={colors.mutedForeground} />
            <Text
              style={[
                styles.dtFieldText,
                {
                  color: driverNote.trim() ? colors.foreground : colors.mutedForeground,
                  flex: 1,
                },
              ]}
              numberOfLines={3}
            >
              {driverNote.trim() ? driverNote : "z. B. Bitte am Haupteingang warten"}
            </Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {medicalTransportAvailable ? (
          <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
            <View style={styles.medicalToggleRow}>
              <View style={{ flex: 1, gap: rs(4) }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                  Krankenfahrt (Transportschein)
                </Text>
                <Text style={[styles.dtNote, { color: colors.mutedForeground }]}>
                  Optional — Zahlung über Krankenkasse nach Scan-Vorprüfung.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  const next = !medicalRideEnabled;
                  setMedicalRideEnabled(next);
                  if (!next) dismissTransportScan();
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.medicalToggleTrack,
                  { backgroundColor: medicalRideEnabled ? "#16A34A" : colors.border },
                ]}
              >
                <View
                  style={[
                    styles.medicalToggleThumb,
                    { alignSelf: medicalRideEnabled ? "flex-end" : "flex-start" },
                  ]}
                />
              </Pressable>
            </View>
            {medicalRideEnabled ? (
              <View style={styles.medicalScanBox}>
                <Text style={[styles.medicalScanLabel, { color: "#1D4ED8" }]}>Zahlungsart: Krankenkasse (KK)</Text>
                <Pressable
                  style={[styles.transportScanBtn, transportScanBusy && { opacity: 0.65 }]}
                  disabled={transportScanBusy || submitting}
                  onPress={openTransportScanPicker}
                >
                  {transportScanBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="camera" size={16} color="#fff" />
                  )}
                  <Text style={styles.transportScanBtnText}>
                    {transportScanBusy ? "Transportschein wird geprüft…" : "Transportschein scannen"}
                  </Text>
                </Pressable>
                {transportScanTrafficLight ? (
                  <>
                    <MedicalTrafficLightCard
                      scanApi="customer"
                      trafficLight={transportScanTrafficLight}
                      warnings={[]}
                      customerReasonOverride={transportScanReasonDe}
                      onPrimaryAction={() => {}}
                      hidePrimaryButton
                    />
                    {transportScanTrafficLight === "green" ? (
                      <Text style={styles.medicalScanHint}>Fahrer prüft vor Ort nochmals.</Text>
                    ) : null}
                    {transportScanTrafficLight === "yellow" ? (
                      <Text style={[styles.medicalScanHint, { color: "#B45309" }]}>
                        Letzte Entscheidung beim Fahrer.
                      </Text>
                    ) : null}
                    {transportScanTrafficLight === "red" ? (
                      <>
                        <Text style={[styles.medicalScanHint, { color: "#B91C1C", fontFamily: "Inter_600SemiBold" }]}>
                          Schein ungültig — weiter ohne KK?
                        </Text>
                        <Pressable style={styles.selfPaySwitchBtn} onPress={switchMedicalToBar}>
                          <Text style={styles.selfPaySwitchBtnText}>Stattdessen Bar zahlen</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.medicalScanHint, { color: "#2563EB" }]}>
                    Bitte Transportschein scannen, um die Reservierung freizugeben.
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Vehicle — only after all fields filled */}
        {formComplete && (
          <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Fahrzeug</Text>
            <View style={styles.vehicleRow}>
              {VEHICLES.map((v: VehicleOption) => {
                const active = selectedVehicle === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[
                      styles.vehicleCard,
                      {
                        borderColor: active ? "#DC2626" : colors.border,
                        backgroundColor: active ? "#DC262610" : colors.muted,
                      },
                    ]}
                    onPress={() => { setSelectedVehicle(v.id as VehicleType); Haptics.selectionAsync(); }}
                  >
                    <View style={[styles.vehicleIcon, { backgroundColor: active ? "#DC262622" : colors.border + "40" }]}>
                      <MaterialCommunityIcons
                        name={v.icon as any}
                        size={28}
                        color={v.id === "wheelchair" ? NB_WHEELCHAIR_ICON : NB_CAR_ICON}
                      />
                    </View>
                    <Text style={[styles.vehicleName, { color: active ? "#DC2626" : colors.foreground }]} numberOfLines={2}>
                      {v.name}
                    </Text>
                    {fareEstimates[v.id] != null && (
                      <Text
                        style={[
                          styles.vehiclePrice,
                          { color: active ? "#DC2626" : colors.mutedForeground },
                        ]}
                      >
                        {`ab ${fareEstimates[v.id]!.toFixed(2)} €`}
                      </Text>
                    )}
                    {fareLoading && fareEstimates[v.id] == null && (
                      <Text style={[styles.vehiclePriceLoading, { color: colors.mutedForeground }]}>…</Text>
                    )}
                    {active && (
                      <View style={styles.vehicleCheck}>
                        <Feather name="check-circle" size={14} color="#DC2626" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {selectedVehicle === "wheelchair" && (
              <View style={{ marginTop: 12, backgroundColor: colors.muted, borderRadius: 12, padding: 14, gap: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 4 }}>Rollstuhl-Optionen</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Rollstuhl klappbar</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Kann zusammengeklappt werden</Text>
                  </View>
                  <Pressable
                    onPress={() => { setWheelchairFoldable(!wheelchairFoldable); Haptics.selectionAsync(); }}
                    style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: wheelchairFoldable ? "#34C759" : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignSelf: wheelchairFoldable ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Begleitperson</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Eine Begleitperson mitfahrend</Text>
                  </View>
                  <Pressable
                    onPress={() => { setWheelchairCompanion(!wheelchairCompanion); Haptics.selectionAsync(); }}
                    style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: wheelchairCompanion ? "#34C759" : colors.border, justifyContent: "center", paddingHorizontal: 2 }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignSelf: wheelchairCompanion ? "flex-end" : "flex-start", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
                  </Pressable>
                </View>
              </View>
            )}
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: rs(4) }]}>Kostenübernahme-Code</Text>
            <Text style={[styles.dtNote, { color: colors.mutedForeground }]}>
              Bei gültigen Code erfolgt die Abrechnung über den Partner.
            </Text>
            <View style={[styles.inputBox, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER, borderWidth: StyleSheet.hairlineWidth }]}>
              <Feather name="hash" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputText, { color: colors.foreground }]}
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder="z. B. HOTEL-STUTTGART-2026"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        {/* Submit button */}
        {formComplete && (
          <Pressable
            style={[styles.submitBtn, { opacity: canSubmitReservation ? 1 : 0.45 }]}
            disabled={!canSubmitReservation}
            onPress={handleSubmit}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="check-circle" size={20} color="#fff" />
            }
            <Text style={styles.submitBtnText}>{submitButtonLabel}</Text>
          </Pressable>
        )}

    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isInstant ? (
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
          <Pressable onPress={exitBookingScreen} style={styles.backBtn} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sofortfahrt</Text>
          </View>
          <View style={{ width: rs(36) }} />
        </View>
      ) : (
        <View
          style={[
            styles.liveSearchHeader,
            { paddingTop: topPad + 8, backgroundColor: HOME_SHEET_PANEL, borderBottomColor: HOME_SHEET_RIM },
          ]}
        >
          <View style={styles.liveSearchHeaderRow}>
            <Pressable style={styles.liveSearchBackBtn} onPress={exitBookingScreen} hitSlop={10}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Reservieren</Text>
            </View>
            <Pressable style={styles.liveSearchCancelBtn} onPress={exitBookingScreen} hitSlop={10}>
              <Text style={[styles.liveSearchCancelBtnText, { color: colors.primary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      )}

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          !isInstant && { paddingBottom: rs(24) + insets.bottom + rs(88) },
        ]}
        bottomOffset={insets.bottom + rs(8)}
      >
        {renderRouteAddressCard()}
        {renderBookingFormSections()}
      </KeyboardAwareScrollViewCompat>

      {!isInstant ? (
        <View
          style={[
            styles.reserveBottomBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + rs(16),
            },
          ]}
        >
          {renderCustomerBrokerNotice()}
        </View>
      ) : null}

      <BookingDateTimePicker
        visible={showDtPicker}
        value={scheduledAt}
        onClose={() => setShowDtPicker(false)}
        onConfirm={(d) => { setScheduledAt(d); setShowDtPicker(false); }}
        colors={colors}
      />
      <DriverNoteModal
        visible={showDriverNoteModal}
        value={driverNote}
        onClose={() => setShowDriverNoteModal(false)}
        onConfirm={(note) => {
          setDriverNote(note);
          setShowDriverNoteModal(false);
        }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: rs(52),
  },
  backBtn: { width: rs(36), height: rs(36), justifyContent: "center", alignItems: "center" },
  headerCenter: { flex: 1, alignItems: "center", gap: rs(2) },
  headerTitle: { ...accountSheetHeaderTitle },
  headerSub: accountSheetSecondaryLabel,
  content: { paddingHorizontal: rs(8), paddingTop: rs(24), gap: rs(16), paddingBottom: rs(40) },

  card: { borderRadius: rs(16), padding: rs(16), gap: rs(12) },
  sectionTitle: accountSheetCardTitle,
  driverNoteSectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    flexWrap: "wrap",
  },

  routeAddressCard: {
    borderRadius: rs(16),
    borderWidth: 1.5,
    overflow: "visible",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(2) },
    shadowOpacity: 0.06,
    shadowRadius: rs(8),
    elevation: 3,
  },
  fahrzielRoute: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  fahrzielTimeline: {
    width: rs(32),
    alignItems: "center",
    paddingTop: rs(18),
    paddingBottom: rs(18),
    gap: rs(2),
    flexShrink: 0,
  },
  fahrzielDotOrigin: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
    backgroundColor: "#222222",
    borderWidth: 2,
    borderColor: "#555555",
  },
  fahrzielConnector: {
    flex: 1,
    width: rs(2),
    borderRadius: rs(1),
    marginVertical: rs(3),
  },
  fahrzielDotDest: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
  },
  fahrzielFieldsCol: {
    flex: 1,
    minWidth: 0,
    overflow: "visible",
    position: "relative",
  },
  fahrzielFieldSep: {
    height: rs(2),
    marginLeft: rs(8),
    marginRight: rs(8),
    opacity: 0.45,
  },
  fahrzielSwapRow: {
    position: "absolute",
    right: rs(10),
    top: "50%",
    marginTop: rs(-17),
    zIndex: 5,
  },
  fahrzielSwap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(17),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeRowWrap: { flex: 1, minWidth: 0, overflow: "visible" },
  routeRowWrapFocused: { zIndex: 30 },
  routeRowPress: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(6),
    flex: 1,
    minWidth: 0,
    paddingHorizontal: rs(14),
    paddingVertical: rs(10),
    minHeight: rs(52),
  },
  routeRowEditing: { borderRadius: rs(12) },
  routeRowBody: { gap: rs(6), minWidth: 0 },
  routeRowBodyGrow: { flex: 1, minWidth: 0, alignSelf: "stretch" },
  routeRowCaption: accountSheetCaptionLabel,
  routeRowInput: {
    ...accountSheetPrimaryLabel,
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    padding: 0,
    margin: 0,
    minHeight: rs(28),
    fontSize: rf(16), fontFamily: "Inter_400Regular",
    lineHeight: rf(22),
  },
  routeGpsBtn: {
    width: rs(30),
    height: rs(30),
    alignItems: "center",
    justifyContent: "center",
    marginTop: rs(12),
    flexShrink: 0,
  },
  routePreviewTrailing: { marginTop: rs(12), flexShrink: 0 },
  routeEditActionsInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    marginTop: rs(10),
    flexShrink: 0,
  },
  routeEditBarBelow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: rs(10),
    paddingTop: rs(4),
    paddingBottom: rs(2),
  },
  routeEditActions: { flexDirection: "row", alignItems: "center", gap: rs(8), flexShrink: 0 },
  routeIconBtn: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  routeIconBtnDone: { backgroundColor: HELP_FIELD_FOCUS, borderColor: HELP_FIELD_FOCUS },
  inputBody: { flex: 1 },

  inputLabel: { ...accountSheetCaptionLabel, marginBottom: rs(4) },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
  },
  inputBoxRoute: { minHeight: rs(56), paddingVertical: rs(12), paddingHorizontal: rs(12), alignItems: "center" },
  addressPreview: { flex: 1, gap: rs(2), justifyContent: "center" },
  routeAddressPreview: { flex: 1, gap: rs(2), justifyContent: "center", minWidth: 0 },
  addressLine1: accountSheetPrimaryLabel,
  addressLine2: accountSheetSecondaryLabel,
  routeAddressLine1: {
    fontSize: rf(15),
    fontFamily: "Inter_500Medium",
    lineHeight: rf(20),
  },
  routeAddressLine2: {
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
    lineHeight: rf(18),
  },
  inputText: { flex: 1, ...accountSheetInputText },
  inputTextRoute: { fontSize: rf(15), lineHeight: rf(21), fontFamily: "Inter_400Regular" },

  suggestionBox: { borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: rs(4) },
  suggestionBoxTaxi: {
    maxHeight: rs(200),
    zIndex: 50,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.12,
    shadowRadius: rs(10),
  },
  suggestionHeader: {
    ...accountSheetCaptionLabel,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: rs(14),
    paddingTop: rs(10),
    paddingBottom: rs(4),
  },
  suggestionItem: { flexDirection: "row", alignItems: "center", gap: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(10) },
  suggestionIconBox: { width: rs(28), height: rs(28), borderRadius: rs(8), justifyContent: "center", alignItems: "center" },
  suggestionText: accountSheetPrimaryLabel,
  suggestionSub: { ...accountSheetSecondaryLabel, marginTop: 1 },

  dtField: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(14),
    paddingVertical: rs(14),
  },
  dtFieldText: { flex: 1, ...accountSheetPrimaryLabel },
  dtNote: accountSheetSecondaryLabel,
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    padding: rs(12),
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
  },
  instantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  instantBadgeText: { ...accountSheetPrimaryLabel, color: "#16A34A" },

  composeToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
    borderRadius: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: rs(6),
  },
  composeToolbarAction: accountSheetToolbarAction,
  driverNoteCard: {
    padding: rs(12),
    gap: rs(8),
  },
  driverNoteSectionTitle: {
    ...accountSheetCardTitle,
    fontSize: rf(15),
  },
  driverNoteHint: {
    ...accountSheetCaptionLabel,
    fontSize: rf(12),
    lineHeight: rf(16),
  },
  driverNoteModalCard: {
    maxWidth: rs(360),
  },
  driverNoteModalBody: {
    paddingHorizontal: rs(16),
    paddingTop: rs(14),
    paddingBottom: rs(16),
    gap: rs(8),
  },
  driverNoteModalInput: {
    minHeight: rs(120),
    maxHeight: rs(160),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: rf(15),
    lineHeight: rf(21),
    fontFamily: "Inter_400Regular",
  },
  driverNoteModalCount: {
    alignSelf: "flex-end",
    ...accountSheetCaptionLabel,
  },

  accessoryBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryDoneBtn: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(6),
    borderRadius: rs(8),
    backgroundColor: HELP_FIELD_FOCUS,
  },
  accessoryDoneText: { ...accountSheetButtonLabel, color: "#FFFFFF", fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  accessoryDone: { ...accountSheetToolbarAction, color: "#007AFF" },

  vehicleRow: { flexDirection: "row", gap: rs(10) },
  vehicleCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: rs(14),
    paddingHorizontal: rs(8),
    borderRadius: rs(14),
    borderWidth: 1,
    gap: rs(8),
    position: "relative",
  },
  vehicleIcon: { width: rs(56), height: rs(56), borderRadius: rs(12), justifyContent: "center", alignItems: "center" },
  vehicleName: { ...accountSheetChipLabel, textAlign: "center" },
  vehiclePrice: {
    fontSize: rf(13),
    fontFamily: "Inter_600SemiBold",
    marginTop: rs(2),
    textAlign: "center",
  },
  vehiclePriceLoading: {
    fontSize: rf(13),
    fontFamily: "Inter_400Regular",
    marginTop: rs(2),
    textAlign: "center",
  },
  vehicleCheck: { position: "absolute", top: 6, right: 6 },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(10),
    backgroundColor: "#111111",
    borderRadius: rs(14),
    paddingVertical: rs(15),
  },
  submitBtnText: { ...accountSheetButtonLabel, color: "#fff" },
  medicalToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
  },
  medicalToggleTrack: {
    width: rs(50),
    height: rs(28),
    borderRadius: rs(14),
    justifyContent: "center",
    paddingHorizontal: rs(2),
  },
  medicalToggleThumb: {
    width: rs(24),
    height: rs(24),
    borderRadius: rs(12),
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  medicalScanBox: {
    marginTop: rs(12),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    padding: rs(14),
    gap: rs(10),
  },
  medicalScanLabel: {
    fontSize: rf(12),
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  medicalScanHint: {
    fontSize: rf(12),
    fontFamily: "Inter_500Medium",
    color: "#1D4ED8",
    lineHeight: rf(18),
  },
  transportScanBtn: {
    backgroundColor: "#0F766E",
    borderRadius: rs(11),
    paddingVertical: rs(11),
    paddingHorizontal: rs(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
  },
  transportScanBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: rf(13) },
  selfPaySwitchBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: rs(11),
    paddingVertical: rs(11),
    paddingHorizontal: rs(12),
    alignItems: "center",
    backgroundColor: "#fff",
  },
  selfPaySwitchBtnText: { color: "#0F172A", fontFamily: "Inter_700Bold", fontSize: rf(13) },

  reserveBottomBar: {
    paddingTop: rs(12),
    paddingHorizontal: rs(8),
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  dtModalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#00000055",
    paddingHorizontal: rs(24),
  },
  dtModalOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  dtModalCard: {
    width: "100%",
    maxWidth: rs(360),
    borderRadius: rs(20),
    paddingBottom: rs(16),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity: 0.15,
    shadowRadius: rs(24),
    elevation: 12,
  },
  dtSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dtSheetTitle: accountSheetCardTitle,
  dtSheetAction: accountSheetToolbarAction,
  dtSpinner: { height: rs(216), alignSelf: "center" },

  liveSearchHeader: {
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  liveSearchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveSearchBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  liveSearchCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  liveSearchCancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  liveGpsIconBtn: { padding: rs(4), flexShrink: 0 },
  brokerNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  brokerNoticeText: { flex: 1, fontSize: rf(11), fontFamily: "Inter_400Regular", lineHeight: rf(16) },
  liveResultGroup: { borderRadius: rs(14), borderWidth: 1.5, overflow: "hidden" },
  liveResultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  liveResultIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  liveResultText: { flex: 1 },
  liveResultTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  liveResultSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  liveResultDivider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  liveSearchingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  liveSearchingText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
