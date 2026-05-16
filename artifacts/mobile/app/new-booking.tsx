import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
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
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { effectivePricingModeForCustomerRide, VEHICLES, type VehicleType, type VehicleOption } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import {
  MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
  MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
  userFacingBookingErrorMessage,
  validateAddressCompletenessForBooking,
  validateServiceAreaForBooking,
} from "@/lib/appOperationalConfig";
import { useColors } from "@/hooks/useColors";
import { getRoute, fetchWithTimeout, type GeoLocation } from "@/utils/routing";
import { rf, rs } from "@/utils/scale";

const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";
const DRIVER_NOTE_ACCESSORY_ID = "new-booking-driver-note-keyboard";
const ADDRESS_PICKUP_ACCESSORY_ID = "new-booking-pickup-keyboard";
const ADDRESS_DEST_ACCESSORY_ID = "new-booking-dest-keyboard";
const HELP_FIELD_FOCUS = "#111111";

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
  const line1Street = street && house ? `${street} ${house}` : "";

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

  if (!subline || (!line1Street && !poiText)) {
    const fallback = parseDisplayNameFallback(item.display_name);
    if (!line1) line1 = fallback.line1;
    if (!subline) subline = fallback.subline;
  }

  const fullName = subline ? `${line1}, ${subline}` : line1;
  return {
    name: line1,
    subline,
    fullName,
    isStreetAddress: Boolean(line1Street),
    isPoiAddress,
  };
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
  label,
  value,
  subline,
  placeholder,
  onSelect,
  colors,
  compact = false,
  routeRow = false,
  fieldLabel,
  showGps = false,
  onGpsPress,
  gpsLoading = false,
  inputAccessoryViewID,
}: {
  label: string;
  value: string;
  subline: string;
  placeholder: string;
  onSelect: (selection: SelectedAddress) => void;
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
  routeRow?: boolean;
  fieldLabel?: string;
  showGps?: boolean;
  onGpsPress?: () => void;
  gpsLoading?: boolean;
  inputAccessoryViewID?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!focused && !value.trim()) setQuery("");
  }, [focused, value]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  const showResults = focused && results.length > 0 && query.length >= 2;

  const dismissEdit = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setFocused(false);
    setResults([]);
  };

  const enterEditMode = () => {
    const editQuery = subline ? `${value}, ${subline}` : value;
    setQuery(editQuery);
    setFocused(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancelEdit = () => {
    setResults([]);
    setQuery("");
    dismissEdit();
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setResults([]);
    if (text.length === 0) {
      onSelect(EMPTY_SELECTED_ADDRESS);
    }
    if (debounce.current) clearTimeout(debounce.current);
    if (text.length < 2) return;
    debounce.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setLoading(true);
      try {
        const r = await nominatimSearch(text, ac.signal);
        if (!ac.signal.aborted) setResults(r);
      } finally {
        if (searchAbortRef.current === ac) setLoading(false);
      }
    }, 350);
  };

  const handlePick = (selection: SelectedAddress) => {
    setQuery(selection.name);
    setResults([]);
    setFocused(false);
    inputRef.current?.blur();
    onSelect(selection);
    Haptics.selectionAsync();
  };

  const hasSelection = value.trim().length > 0;
  const showSelectedPreview = (compact || routeRow) && hasSelection && !focused;

  const handleClear = () => {
    searchAbortRef.current?.abort();
    setQuery("");
    setResults([]);
    onSelect(EMPTY_SELECTED_ADDRESS);
  };

  const fieldBorder = focused ? HELP_FIELD_FOCUS : HOME_SHEET_RIM;
  const fieldBorderWidth = focused ? 1.5 : StyleSheet.hairlineWidth;

  const showGpsBtn = routeRow && showGps && !focused && !hasSelection && !loading;

  return (
    <>
      {Platform.OS === "ios" && inputAccessoryViewID ? (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View style={[styles.accessoryBar, { borderTopColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={dismissEdit} hitSlop={10}>
              <Text style={styles.accessoryDone}>Fertig</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    <View style={routeRow ? styles.routeRowWrap : undefined}>
      {!compact && !routeRow ? (
        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      ) : null}
      {routeRow && focused ? (
        <View style={[styles.composeToolbar, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}>
          <Pressable hitSlop={8} onPress={handleCancelEdit} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.composeToolbarAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={dismissEdit} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.composeToolbarAction, { color: colors.foreground }]}>Fertig</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        style={[
          routeRow ? styles.routeRowPress : styles.inputBox,
          !routeRow && compact && styles.inputBoxRoute,
          routeRow && focused && styles.routeRowEditing,
          !routeRow && {
            backgroundColor: HOME_SHEET_INNER,
            borderColor: fieldBorder,
            borderWidth: fieldBorderWidth,
          },
          routeRow && {
            backgroundColor: focused ? HOME_SHEET_INNER : "transparent",
            borderColor: focused ? fieldBorder : "transparent",
            borderWidth: focused ? fieldBorderWidth : 0,
          },
        ]}
        onPress={() => {
          if (showSelectedPreview) enterEditMode();
        }}
      >
        <View style={[routeRow ? styles.routeRowBody : styles.inputBody, { flex: 1 }]}>
          {routeRow && fieldLabel ? (
            <Text style={[styles.routeRowCaption, { color: colors.mutedForeground }]}>{fieldLabel}</Text>
          ) : null}
          {showSelectedPreview ? (
            <View style={styles.addressPreview}>
              <Text style={[styles.addressLine1, { color: colors.foreground }]} numberOfLines={2}>
                {value}
              </Text>
              {subline ? (
                <Text style={[styles.addressLine2, { color: colors.mutedForeground }]} numberOfLines={1}>
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
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="words"
              inputAccessoryViewID={Platform.OS === "ios" ? inputAccessoryViewID : undefined}
            />
          )}
        </View>
        {loading && <ActivityIndicator size="small" color={colors.foreground} />}
        {showGpsBtn && onGpsPress ? (
          <Pressable hitSlop={8} onPress={onGpsPress} style={styles.routeGpsBtn}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="navigation" size={17} color={colors.primary} />
            )}
          </Pressable>
        ) : null}
        {!loading && !showGpsBtn && focused && query.length > 0 ? (
          <Pressable hitSlop={8} onPress={handleClear}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </Pressable>

      {/* Nominatim results */}
      {showResults && (
        <View style={[styles.suggestionBox, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
          {results.map((s, i) => (
            <Pressable
              key={i}
              style={[styles.suggestionItem, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HOME_SHEET_RIM }]}
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
      )}
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

  if (Platform.OS === "android" && visible) {
    return (
      <RNDateTimePicker
        value={draft}
        mode="datetime"
        display="default"
        is24Hour
        minimumDate={minDate}
        onChange={(event, next) => {
          if (event.type === "dismissed") {
            onClose();
            return;
          }
          if (next) {
            onConfirm(next);
            onClose();
          }
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.dtModal, { backgroundColor: HOME_SHEET_PANEL }]} onPress={(e) => e.stopPropagation()}>
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
    </Modal>
  );
}

function DriverNoteAccessory({ onDone }: { onDone: () => void }) {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={DRIVER_NOTE_ACCESSORY_ID}>
      <View style={[styles.accessoryBar, { borderTopColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onDone} hitSlop={10}>
          <Text style={styles.accessoryDone}>Fertig</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
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
  const [driverNoteFocused, setDriverNoteFocused] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const driverNoteRef = useRef<TextInput>(null);

  const handleGpsPickup = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Standort", "Bitte Standortzugriff erlauben, um den Abholort zu übernehmen.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const picked = await reverseGeocodeLatLon(pos.coords.latitude, pos.coords.longitude);
      if (picked) {
        setFrom(picked);
        Haptics.selectionAsync();
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
  }, []);

  const formComplete = from.name.length > 0 && to.name.length > 0 && (isInstant || scheduledAt !== null);

  useEffect(() => {
    if (!from.lat || !from.lon || !to.lat || !to.lon) {
      setFareEstimates({});
      return;
    }

    let cancelled = false;
    setFareLoading(true);

    const base = `${process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api.onroda.de/api"}`;

    (async () => {
      try {
        const route = await getRoute(
          { lat: from.lat!, lon: from.lon!, displayName: from.fullName || from.name },
          { lat: to.lat!, lon: to.lon!, displayName: to.fullName || to.name },
        );

        const results = await Promise.all(
          ["standard", "xl", "wheelchair"].map(async (vehicle) => {
            try {
              const qs = new URLSearchParams({
                vehicle,
                fromLat: String(from.lat),
                fromLng: String(from.lon),
                fromFull: from.fullName || from.name,
                distanceKm: String(route.distanceKm),
                durationMinutes: String(route.durationMinutes),
              });
              const r = await fetch(`${base}/fare-estimate?${qs.toString()}`);
              const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
              if (!r.ok || j?.ok !== true) {
                return [vehicle, null] as [string, number | null];
              }
              // API liefert `estimate.total` (gleiches Schema wie RideContext), nicht `est.total`.
              const est = j?.estimate;
              const rawTotal =
                est && typeof est === "object" && est !== null
                  ? (est as Record<string, unknown>).total
                  : undefined;
              const n = typeof rawTotal === "number" ? rawTotal : Number(rawTotal);
              return [vehicle, Number.isFinite(n) ? n : null] as [string, number | null];
            } catch {
              return [vehicle, null] as [string, number | null];
            }
          }),
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
  const swapFromTo = () => {
    setFrom(to);
    setTo(from);
    Haptics.selectionAsync();
  };

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

      console.log("NEW_BOOKING_ADDRESS_DEBUG", {
        origin: from,
        destination: to,
        originDisplayName: fromFull,
        destinationDisplayName: toFull,
        originLat,
        originLon,
        destinationLat,
        destinationLon,
      });

      const hasGeoSelection =
        originLat != null &&
        originLon != null &&
        destinationLat != null &&
        destinationLon != null;

      if (!hasGeoSelection) {
        const addressCheck = validateAddressCompletenessForBooking(fromFull, toFull);
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
        paymentMethod: "Bar",
        vehicle: vehicleApiValue,
        customerName,
        passengerId: passengerId || undefined,
        scheduledAt: isInstant ? null : scheduledAt,
        ...(pricingMode ? { pricingMode } : {}),
        ...(driverNote.trim() ? { partnerBookingMeta: { customer_driver_note: driverNote.trim() } } : {}),
        ...(codeTrim ? { accessCode: codeTrim } : {}),
        ...(profile.billingType === "company" && profile.costCenter.trim() ? { billingReference: profile.costCenter.trim() } : {}),
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

  const dismissDriverNote = () => {
    driverNoteRef.current?.blur();
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isInstant ? "Sofortfahrt" : "Reservieren"}
          </Text>
          {!isInstant ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Fahrt im Voraus planen</Text>
          ) : null}
        </View>
        <View style={{ width: rs(36) }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={topPad + 8}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
        <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Fahrziel</Text>
          <View style={styles.fahrzielBody}>
            <View style={styles.fahrzielRow}>
              <View style={styles.fahrzielDotCol}>
                <View style={styles.fahrzielDotOrigin} />
              </View>
              <AddressInput
                label="Von"
                routeRow
                fieldLabel="Abholort"
                inputAccessoryViewID={ADDRESS_PICKUP_ACCESSORY_ID}
                showGps
                onGpsPress={() => void handleGpsPickup()}
                gpsLoading={gpsLoading}
                value={from.name}
                subline={from.subline}
                placeholder="Wo sollen wir dich abholen?"
                onSelect={setFrom}
                colors={colors}
              />
            </View>
            <View style={[styles.fahrzielDivider, { backgroundColor: HOME_SHEET_RIM }]} />
            <View style={styles.fahrzielRow}>
              <View style={styles.fahrzielDotCol}>
                <View style={[styles.fahrzielDotDest, { backgroundColor: colors.primary }]} />
              </View>
              <AddressInput
                label="Ziel"
                routeRow
                fieldLabel="Zielort"
                inputAccessoryViewID={ADDRESS_DEST_ACCESSORY_ID}
                value={to.name}
                subline={to.subline}
                placeholder="Wohin möchtest du fahren?"
                onSelect={setTo}
                colors={colors}
              />
            </View>
            <Pressable
              style={[styles.fahrzielSwap, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}
              onPress={swapFromTo}
              accessibilityLabel="Start und Ziel tauschen"
            >
              <MaterialCommunityIcons name="swap-vertical" size={17} color={HOME_SHEET_TEXT} />
            </Pressable>
          </View>
        </View>

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

        <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
          <View style={styles.driverNoteSectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notiz an Fahrer</Text>
            {driverNote.trim().length > 0 ? (
              <Feather name="check-circle" size={20} color="#16A34A" accessibilityLabel="Notiz wird mitgeschickt" />
            ) : null}
          </View>
          {driverNoteFocused ? (
            <View style={[styles.composeToolbar, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setDriverNote("");
                  dismissDriverNote();
                }}
              >
                <Text style={[styles.composeToolbarAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={dismissDriverNote}>
                <Text style={[styles.composeToolbarAction, { color: colors.foreground }]}>Fertig</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.driverNoteFieldWrap}>
            <TextInput
              ref={driverNoteRef}
              value={driverNote}
              onChangeText={setDriverNote}
              placeholder="z. B. Bitte am Haupteingang warten"
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
              maxLength={140}
              onFocus={() => setDriverNoteFocused(true)}
              onBlur={() => setDriverNoteFocused(false)}
              inputAccessoryViewID={Platform.OS === "ios" ? DRIVER_NOTE_ACCESSORY_ID : undefined}
              style={[
                styles.driverNoteInput,
                driverNoteFocused && styles.driverNoteInputFocused,
                {
                  color: colors.foreground,
                  backgroundColor: HOME_SHEET_INNER,
                  borderColor: driverNoteFocused ? HELP_FIELD_FOCUS : HOME_SHEET_RIM,
                },
              ]}
            />
            <Text style={[styles.driverNoteCount, { color: colors.mutedForeground }]}>{driverNote.length}/140</Text>
          </View>
          <Text style={[styles.dtNote, { color: colors.mutedForeground }]}>
            Optional — nur für den Fahrer dieser Reservierung sichtbar.
          </Text>
        </View>

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
                        size={22}
                        color={v.id === "wheelchair" ? NB_WHEELCHAIR_ICON : NB_CAR_ICON}
                      />
                    </View>
                    <Text style={[styles.vehicleName, { color: active ? "#DC2626" : colors.foreground }]} numberOfLines={2}>
                      {v.name}
                    </Text>
                    {fareEstimates[v.id] != null && (
                      <Text style={{ fontSize: 11, color: active ? "#DC2626" : colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 2 }}>
                        {`ab ${fareEstimates[v.id]!.toFixed(2)} €`}
                      </Text>
                    )}
                    {fareLoading && fareEstimates[v.id] == null && (
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>…</Text>
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
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Kann zusammengeklappt werden</Text>
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
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Eine Begleitperson mitfahrend</Text>
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
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: rs(4) }]}>Freigabe-Code (optional)</Text>
            <Text style={[styles.dtNote, { color: colors.mutedForeground }]}>
              Kostenübernahme durch Firma oder Hotel — wird im System geprüft.
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
            style={[styles.submitBtn, { opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="check-circle" size={20} color="#fff" />
            }
            <Text style={styles.submitBtnText}>{submitting ? "Wird gesendet…" : "Reservierung absenden"}</Text>
          </Pressable>
        )}

        {!formComplete && (
          <View style={[styles.hintBox, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
            <Feather name="info" size={15} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Bitte alle Felder ausfüllen, um die Fahrzeugauswahl zu sehen.
            </Text>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BookingDateTimePicker
        visible={showDtPicker}
        value={scheduledAt}
        onClose={() => setShowDtPicker(false)}
        onConfirm={(d) => { setScheduledAt(d); setShowDtPicker(false); }}
        colors={colors}
      />
      <DriverNoteAccessory onDone={dismissDriverNote} />
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

  fahrzielBody: {
    position: "relative",
    overflow: "hidden",
  },
  fahrzielRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: rs(12),
    paddingRight: rs(40),
    paddingVertical: rs(12),
    gap: rs(10),
  },
  fahrzielDotCol: { width: rs(12), alignItems: "center", paddingTop: rs(18) },
  fahrzielDotOrigin: {
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
    backgroundColor: "#9CA3AF",
    borderWidth: 1.5,
    borderColor: "#6B7280",
  },
  fahrzielDotDest: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  fahrzielDivider: { height: StyleSheet.hairlineWidth, marginLeft: rs(34) },
  fahrzielSwap: {
    position: "absolute",
    right: rs(10),
    top: "50%",
    marginTop: rs(-16),
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  routeRowWrap: { flex: 1, minWidth: 0 },
  routeRowPress: { flexDirection: "row", alignItems: "flex-start", gap: rs(8), flex: 1 },
  routeRowEditing: { borderRadius: rs(12) },
  routeRowBody: { flex: 1, gap: rs(4), minWidth: 0 },
  routeRowCaption: accountSheetCaptionLabel,
  routeRowInput: {
    ...accountSheetPrimaryLabel,
    padding: 0,
    margin: 0,
    minHeight: rs(22),
  },
  routeGpsBtn: { width: rs(30), height: rs(30), alignItems: "center", justifyContent: "center", marginTop: rs(14) },
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
  addressLine1: accountSheetPrimaryLabel,
  addressLine2: accountSheetSecondaryLabel,
  inputText: { flex: 1, ...accountSheetInputText },
  inputTextRoute: { fontSize: rf(15), lineHeight: rf(21) },

  suggestionBox: { borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: rs(4) },
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
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: rs(8),
  },
  composeToolbarAction: accountSheetToolbarAction,
  driverNoteFieldWrap: { position: "relative" },
  driverNoteInput: {
    minHeight: rs(120),
    maxHeight: rs(200),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    paddingBottom: rs(28),
    ...accountSheetInputText,
  },
  driverNoteInputFocused: { borderWidth: 1.5 },
  driverNoteCount: { position: "absolute", right: rs(12), bottom: rs(10), ...accountSheetCaptionLabel },

  accessoryBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
  vehicleIcon: { width: rs(48), height: rs(48), borderRadius: rs(12), justifyContent: "center", alignItems: "center" },
  vehicleName: { ...accountSheetChipLabel, textAlign: "center" },
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

  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderRadius: rs(16),
    padding: rs(14),
  },
  hintText: { flex: 1, ...accountSheetSecondaryLabel },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000055" },
  dtModal: { borderTopLeftRadius: rs(20), borderTopRightRadius: rs(20), paddingBottom: rs(24) },
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
});
