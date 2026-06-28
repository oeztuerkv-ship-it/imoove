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
import { BottomTabBar, BOTTOM_TAB_BAR_HOME_OFFSET_Y, tabMainScreenScrollPaddingBottom } from "@/components/BottomTabBar";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import {
  effectivePricingModeForCustomerRide,
  VEHICLES,
  type PaymentMethod,
  type VehicleType,
  type VehicleOption,
} from "@/context/RideContext";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
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
import { TaxiRouteAddressCard, type TaxiRouteAddressCardHandle } from "@/components/booking/TaxiRouteAddressCard";
import {
  EMPTY_SELECTED_ADDRESS,
  selectedAddressIsBookingComplete,
  type SelectedAddress,
} from "@/components/booking/selectedAddress";
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
import { fetchWithTimeout, searchLocation, type GeoLocation } from "@/utils/routing";
import {
  fetchServerDrivingRoute,
  ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
} from "@/utils/routeDistanceApi";
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
  city: string;
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
    city,
    isStreetAddress: Boolean(street && house),
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [transportScanBusy, setTransportScanBusy] = useState(false);
  const [pendingTransportScanId, setPendingTransportScanId] = useState<string | null>(null);
  const [transportScanTrafficLight, setTransportScanTrafficLight] = useState<MedicalTrafficLight | null>(null);
  const [transportScanReasonDe, setTransportScanReasonDe] = useState<string | null>(null);

  const dismissTransportScan = useCallback(() => {
    setPendingTransportScanId(null);
    setTransportScanTrafficLight(null);
    setTransportScanReasonDe(null);
  }, []);

  const switchVoucherToBar = useCallback(() => {
    setPaymentMethod("cash");
    dismissTransportScan();
    Haptics.selectionAsync();
  }, [dismissTransportScan]);

  const reservePaymentOptions = useMemo(
    () =>
      [
        { id: "cash" as const, label: "Bar", isEuro: true },
        { id: "paypal" as const, label: "PayPal", isPaypal: true },
        { id: "app" as const, label: "App bezahlen", isApp: true },
        { id: "voucher" as const, label: "Transportschein (KK)", isVoucher: true },
        { id: "access_code" as const, label: "Gutschein / Code", isAccessCode: true },
      ] as const,
    [],
  );

  const [searchUserGps, setSearchUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const routeAddressCardRef = useRef<TaxiRouteAddressCardHandle>(null);

  const exitBookingScreen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/" as Href);
  }, []);

  const dismissBookingKeyboard = useCallback(() => {
    routeAddressCardRef.current?.blurAll();
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
    routeAddressCardRef.current?.focusDestAddressField();
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
    setPaymentMethod("cash");
    dismissTransportScan();
  }, [dismissTransportScan]);

  const formComplete =
    selectedAddressIsBookingComplete(from) &&
    selectedAddressIsBookingComplete(to) &&
    (isInstant || scheduledAt !== null);

  const canSubmitReservation = useMemo(() => {
    if (!formComplete || submitting) return false;
    if (paymentMethod !== "voucher") return true;
    if (!pendingTransportScanId || !transportScanTrafficLight) return false;
    return transportScanTrafficLight === "green" || transportScanTrafficLight === "yellow";
  }, [formComplete, submitting, paymentMethod, pendingTransportScanId, transportScanTrafficLight]);

  const submitButtonLabel = useMemo(() => {
    if (submitting) return "Wird gesendet…";
    if (paymentMethod === "voucher" && transportScanTrafficLight === "yellow") {
      return isInstant ? "Trotzdem buchen" : "Trotzdem reservieren";
    }
    return isInstant ? "Jetzt buchen" : "Reservierung absenden";
  }, [submitting, paymentMethod, transportScanTrafficLight, isInstant]);

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
        const route = await fetchServerDrivingRoute({
          fromFull: from.fullName || from.name,
          toFull: to.fullName || to.name,
          fromLat: from.lat!,
          fromLon: from.lon!,
          toLat: to.lat!,
          toLon: to.lon!,
        });
        if (!route.ok) {
          if (!cancelled) setFareEstimates({});
          return;
        }

        const estimates = await fetchFareEstimatesByVehicle(["standard", "xl", "wheelchair"], {
          fromFull: from.fullName || from.name,
          fromLat: from.lat!,
          fromLon: from.lon!,
          toFull: to.fullName || to.name,
          toLat: to.lat!,
          toLon: to.lon!,
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
    if (paymentMethod === "access_code" && accessCode.trim().length === 0) {
      Alert.alert("Code fehlt", "Bitte Gutschein- oder Freigabe-Code eingeben.");
      return;
    }
    if (paymentMethod === "voucher") {
      if (!pendingTransportScanId || !transportScanTrafficLight) {
        Alert.alert("Transportschein", "Bitte zuerst den Transportschein scannen.");
        return;
      }
      if (transportScanTrafficLight === "red") {
        Alert.alert(
          "Transportschein",
          "Der Schein wurde als ungültig erkannt. Bitte erneut scannen oder Bar wählen.",
        );
        return;
      }
    }
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
      const bookingRoute = await fetchServerDrivingRoute({
        fromFull,
        toFull,
        fromLat: originLat!,
        fromLon: originLon!,
        toLat: destinationLat!,
        toLon: destinationLon!,
      });
      if (!bookingRoute.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Buchung nicht möglich", bookingRoute.message || ROUTE_NOT_COMPUTABLE_MESSAGE_DE);
        return;
      }

      const partnerBookingMeta: Record<string, unknown> = {};
      if (driverNote.trim()) partnerBookingMeta.customer_driver_note = driverNote.trim();
      const isVoucherPayment = paymentMethod === "voucher";
      if (isVoucherPayment) partnerBookingMeta.medical_ride = true;
      const paymentLabel =
        paymentMethod === "cash"
          ? "Bar"
          : paymentMethod === "paypal"
            ? "PayPal"
            : paymentMethod === "app"
              ? "App"
              : paymentMethod === "access_code"
                ? "Gutschein / Freigabe (Code)"
                : "Krankenkasse";

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
        paymentMethod: paymentLabel,
        vehicle: vehicleApiValue,
        customerName,
        passengerId: passengerId || undefined,
        scheduledAt: isInstant ? null : scheduledAt,
        rideKind: isVoucherPayment ? "medical" : "standard",
        payerKind: isVoucherPayment ? "insurance" : "passenger",
        ...(pricingMode ? { pricingMode } : {}),
        ...(Object.keys(partnerBookingMeta).length > 0 ? { partnerBookingMeta } : {}),
        ...(isVoucherPayment && pendingTransportScanId
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
    <TaxiRouteAddressCard
      ref={routeAddressCardRef}
      from={from}
      to={to}
      onFromSelect={setFrom}
      onToSelect={setTo}
      searchUserGps={searchUserGps}
      gpsLoading={gpsLoading}
      onGpsPickup={() => void handleGpsPickup()}
    />
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

        <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Zahlungsart wählen</Text>
          <View style={styles.paymentGrid}>
            {reservePaymentOptions.map((opt) => {
              const isSelected = paymentMethod === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.paymentBtn,
                    {
                      borderColor: isSelected ? ONRODA_MARK_RED : colors.border,
                      backgroundColor: isSelected ? `${ONRODA_MARK_RED}0F` : HOME_SHEET_INNER,
                      borderWidth: isSelected ? 2 : 1.5,
                    },
                  ]}
                  onPress={() => {
                    if (opt.id !== "voucher") dismissTransportScan();
                    setPaymentMethod(opt.id);
                    Haptics.selectionAsync();
                  }}
                >
                  <View style={styles.paymentBtnLeft}>
                    {opt.id === "cash" ? (
                      <Text style={[styles.paymentEuro, { color: colors.foreground }]}>€</Text>
                    ) : opt.id === "paypal" ? (
                      <Text style={[styles.paypalBadge, { color: "#1565C0" }]}>P</Text>
                    ) : opt.id === "app" ? (
                      <Feather name="smartphone" size={14} color={colors.foreground} />
                    ) : opt.id === "access_code" ? (
                      <MaterialCommunityIcons name="shield-check-outline" size={16} color="#15803D" />
                    ) : (
                      <MaterialCommunityIcons name="ticket-percent-outline" size={16} color={colors.foreground} />
                    )}
                    <Text style={[styles.paymentBtnText, { color: colors.foreground }]}>{opt.label}</Text>
                  </View>
                  {isSelected ? (
                    <View style={styles.paymentCheck}>
                      <Feather name="check" size={10} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {paymentMethod === "voucher" ? (
            <View style={styles.medicalScanBox}>
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
                      <Pressable style={styles.selfPaySwitchBtn} onPress={switchVoucherToBar}>
                        <Text style={styles.selfPaySwitchBtnText}>Stattdessen Bar zahlen</Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.medicalScanHint, { color: "#2563EB" }]}>
                  {isInstant
                    ? "Bitte Transportschein scannen, damit die KK-Abrechnung für die Buchung möglich ist. Letzte Entscheidung beim Fahrer."
                    : "Bitte Transportschein scannen, damit die KK-Abrechnung für die Reservierung möglich ist. Letzte Entscheidung beim Fahrer."}
                </Text>
              )}
            </View>
          ) : null}
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
          { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) },
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
      <BottomTabBar active="buchen" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
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
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(8),
    marginTop: rs(8),
  },
  paymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: rs(11),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    minWidth: "47%",
    minHeight: rs(46),
    flexGrow: 1,
  },
  paymentBtnLeft: { flexDirection: "row", alignItems: "center", gap: rs(6), flexShrink: 1 },
  paymentBtnText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  paymentEuro: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  paypalBadge: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  paymentCheck: {
    width: rs(18),
    height: rs(18),
    borderRadius: rs(9),
    backgroundColor: ONRODA_MARK_RED,
    alignItems: "center",
    justifyContent: "center",
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
