import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams, usePathname, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
  calculateCopayment,
  effectivePricingModeForCustomerRide,
  type PaymentMethod,
  type VehicleType,
  VEHICLES,
  useRide,
} from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { rs, rf } from "@/utils/scale";
import { useUser } from "@/context/UserContext";
import {
  MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
  MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
  userFacingBookingErrorMessage,
  validateAddressCompletenessForBooking,
  validateServiceAreaForBooking,
} from "@/lib/appOperationalConfig";
import { CUSTOMER_BROKER_NOTICE_DE } from "@/constants/customerBrokerNoticeDe";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { useColors } from "@/hooks/useColors";
import { customerPayerBlockFromBooking } from "@/utils/customerBillingCopy";
import { formatEuro } from "@/utils/fareCalculator";
import type { RideAccessibilityOptions } from "@/context/RideRequestContext";
import { MedicalTrafficLightCard } from "@/components/MedicalTrafficLightCard";
import { pickTransportImageBase64 } from "@/utils/medicalScanCapture";
import {
  medicalScanErrorMessageDe,
  postCustomerMedicalTransportScan,
  type MedicalTrafficLight,
} from "@/utils/medicalScanApi";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Bar",
  paypal: "PayPal",
  card: "Kreditkarte",
  voucher: "Transportschein",
  app: "App",
  access_code: "Gutschein / Freigabe",
};

function accessCodeBookingErrorMessage(code: string): string {
  const m: Record<string, string> = {
    pickup_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
    ride_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
    address_house_number_required: MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
    accessibility_options_required_for_wheelchair: "Bitte Rollstuhl-Details vollständig angeben.",
    accessibility_options_invalid: "Rollstuhl-Details sind unvollständig oder ungültig.",
    access_code_invalid: "Code unbekannt oder ungültig.",
    access_code_inactive: "Dieser Code ist deaktiviert.",
    access_code_not_yet_valid:
      "Dieser Code ist noch nicht gültig. Bitte ab dem in der Freigabe genannten Zeitpunkt erneut buchen.",
    access_code_expired: "Dieser Code ist abgelaufen (Gültigkeitsende überschritten).",
    access_code_exhausted: "Code bereits eingelöst oder Kontingent aufgebraucht.",
    access_code_wrong_company: "Code passt nicht zu dieser Buchung.",
    access_code_in_use: "Code ist gerade für eine andere Fahrt reserviert — bitte kurz warten oder später erneut versuchen.",
    reservation_lead_time_too_short:
      "Zeit zu knapp. Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte buche eine Sofortfahrt.",
    request_failed: "Buchung konnte nicht gesendet werden.",
  };
  if (m[code]) return m[code];
  if (/unauthorized|anmelden/i.test(code)) {
    return "Bitte kurz warten und erneut versuchen — die App bereitet noch Ihre Sitzung vor.";
  }
  return code;
}

/** CTA-Label für sofortige oder geplante Taxi-Buchung. */
function rideConfirmCtaLabel(vehicle: VehicleType | null, hasScheduledTime: boolean): string {
  if (!vehicle) return hasScheduledTime ? "Reservieren" : "Jetzt buchen";
  if (hasScheduledTime) return "Reservieren";
  return "Jetzt buchen";
}

/* Zahlungsmethoden, die einen hinterlegten Token benötigen */
const TOKEN_REQUIRED: PaymentMethod[] = ["paypal", "card", "app"];

const RIDE_PAYMENT_OPTIONS: {
  id: PaymentMethod;
  label: string;
  featherIcon?: string;
  isPaypal?: boolean;
  isEuro?: boolean;
  isCard?: boolean;
  isVoucher?: boolean;
  isApp?: boolean;
  isAccessCode?: boolean;
}[] = [
  { id: "cash", label: "Bar", isEuro: true },
  { id: "paypal", label: "PayPal", isPaypal: true },
  { id: "voucher", label: "Transportschein (KK)", isVoucher: true },
  { id: "app", label: "App bezahlen", isApp: true },
  { id: "access_code", label: "Gutschein / Code", isAccessCode: true },
];

const SERVICE_CLASS_LABELS = {
  rollstuhl: "Rollstuhl",
  xl: "XL",
  taxi: "Taxi",
} as const;

type AssistanceLevel = RideAccessibilityOptions["assistanceLevel"];
type WheelchairType = RideAccessibilityOptions["wheelchairType"];
type CompanionCount = RideAccessibilityOptions["companionCount"];

function assistanceLabel(level: AssistanceLevel): string {
  const m: Record<AssistanceLevel, string> = {
    boarding: "Ich brauche Hilfe beim Einsteigen",
    to_door: "Ich brauche Hilfe bis zur Haustür",
    to_apartment: "Ich brauche Hilfe bis in die Wohnung",
    none: "Keine Hilfe nötig",
  };
  return m[level];
}

function companionLabel(v: CompanionCount): string {
  const m: Record<CompanionCount, string> = {
    0: "keine Begleitperson",
    1: "1 Begleitperson",
    2: "2 Begleitpersonen",
  };
  return m[v];
}

function AccessCodeModal({
  visible,
  value,
  onClose,
  onConfirm,
  colors,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (code: string) => void;
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
        style={accessCodeModalStyles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Pressable style={accessCodeModalStyles.overlayInner} onPress={onClose}>
          <Pressable
            style={[accessCodeModalStyles.card, { backgroundColor: HOME_SHEET_PANEL }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[accessCodeModalStyles.header, { borderBottomColor: HOME_SHEET_RIM }]}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={[accessCodeModalStyles.headerAction, { color: colors.mutedForeground }]}>
                  Abbrechen
                </Text>
              </Pressable>
              <Text style={[accessCodeModalStyles.headerTitle, { color: colors.foreground }]}>
                Gutschein / Code
              </Text>
              <Pressable onPress={confirm} hitSlop={10}>
                <Text style={[accessCodeModalStyles.headerAction, { color: HOME_SHEET_TEXT }]}>Fertig</Text>
              </Pressable>
            </View>
            <View style={accessCodeModalStyles.body}>
              <Text style={[accessCodeModalStyles.hint, { color: colors.mutedForeground }]}>
                Bei gültigem Code erfolgt die Abrechnung über den Partner (z. B. Hotel, Firma, Krankenhaus).
              </Text>
              <TextInput
                ref={inputRef}
                style={[
                  accessCodeModalStyles.input,
                  { color: colors.foreground, backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM },
                ]}
                value={draft}
                onChangeText={setDraft}
                placeholder="Freigabe- oder Gutscheincode"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function RideScreen() {
  const colors = useColors();
  const { config: appCfg } = useOnrodaAppConfig();
  const insets = useSafeAreaInsets();
  const brokerNoticeDe =
    (typeof appCfg.system?.globalNoticeDe === "string" ? appCfg.system.globalNoticeDe.trim() : "") ||
    CUSTOMER_BROKER_NOTICE_DE;
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams();

  useEffect(() => {
    console.log(
      `[NAV TRACE] MOUNT ${pathname}`,
      JSON.stringify(
        {
          screen: "ride",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
    return () => {
      console.log(`[NAV TRACE] UNMOUNT ${pathname}`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- NAV trace: einmaliger Mount-Log
  }, []);

  useEffect(() => {
    console.log(
      `[NAV TRACE] UPDATE ${pathname}`,
      JSON.stringify(
        {
          screen: "ride",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
  }, [pathname, JSON.stringify(params), JSON.stringify(segments)]);

  const {
    origin,
    destination,
    route,
    fareBreakdown,
    selectedVehicle,
    selectedServiceClass,
    paymentMethod,
    isExempted,
    scheduledTime,
    customerDriverNote,
    resetRide,
    setPaymentMethod,
    setIsExempted,
  } = useRide();
  const { addRequest, passengerId } = useRideRequests();
  const { profile } = useUser();
  const btnScale = useRef(new Animated.Value(1)).current;
  const rideScrollRef = useRef<ScrollView>(null);
  const accessibilityScrollRef = useRef<ScrollView>(null);

  const [noTokenVisible, setNoTokenVisible] = useState(false);
  const [preAuthLoading, setPreAuthLoading] = useState(false);
  const [tokenErrorMethod, setTokenErrorMethod] = useState<PaymentMethod | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [assistanceLevel, setAssistanceLevel] = useState<AssistanceLevel | null>(null);
  const [wheelchairType, setWheelchairType] = useState<WheelchairType | null>(null);
  const [canTransfer, setCanTransfer] = useState<boolean | null>(null);
  const [companionCount, setCompanionCount] = useState<CompanionCount | null>(null);
  const [rampRequired, setRampRequired] = useState(false);
  const [carryChairRequired, setCarryChairRequired] = useState(false);
  const [elevatorAvailable, setElevatorAvailable] = useState(false);
  const [stairsPresent, setStairsPresent] = useState(false);
  const [accessibilityNote, setAccessibilityNote] = useState("");
  const [transportScanBusy, setTransportScanBusy] = useState(false);
  const [pendingTransportScanId, setPendingTransportScanId] = useState<string | null>(null);
  const [transportScanTrafficLight, setTransportScanTrafficLight] = useState<MedicalTrafficLight | null>(null);
  const [transportScanReasonDe, setTransportScanReasonDe] = useState<string | null>(null);
  const [brokerNoticeExpanded, setBrokerNoticeExpanded] = useState(false);

  const { config: appConfig } = useOnrodaAppConfig();
  const ridePaymentOptions = RIDE_PAYMENT_OPTIONS;

  function dismissTransportScan() {
    setPendingTransportScanId(null);
    setTransportScanTrafficLight(null);
    setTransportScanReasonDe(null);
  }

  function switchVoucherToSelfPay() {
    dismissTransportScan();
    setPaymentMethod("cash");
    setIsExempted(false);
    Haptics.selectionAsync();
  }

  const canPlaceOrder = React.useMemo(() => {
    if (!paymentMethod || preAuthLoading) return false;
    if (paymentMethod !== "voucher") return true;
    if (!pendingTransportScanId || !transportScanTrafficLight) return false;
    return transportScanTrafficLight === "green" || transportScanTrafficLight === "yellow";
  }, [paymentMethod, preAuthLoading, pendingTransportScanId, transportScanTrafficLight]);

  const orderCtaLabel = React.useMemo(() => {
    if (preAuthLoading) return "Vorautorisierung…";
    if (paymentMethod === "voucher" && transportScanTrafficLight === "yellow") {
      return scheduledTime !== null ? "Trotzdem reservieren" : "Trotzdem buchen";
    }
    return rideConfirmCtaLabel(selectedVehicle, scheduledTime !== null);
  }, [preAuthLoading, paymentMethod, transportScanTrafficLight, selectedVehicle, scheduledTime]);

  const handleAccessibilityNoteFocus = (e: any) => {
    const target = e?.target;
    if (!target || !accessibilityScrollRef.current) return;
    accessibilityScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(target, 110, true);
  };

  useEffect(() => {
    if (paymentMethod == null) setPaymentMethod("cash");
  }, [paymentMethod, setPaymentMethod]);

  useEffect(() => {
    if (paymentMethod !== "access_code") return;
    const t = setTimeout(() => {
      rideScrollRef.current?.scrollToEnd({ animated: true });
    }, 160);
    return () => clearTimeout(t);
  }, [paymentMethod]);

  /* Prüft Token nur für explizit gewählte Online-Zahlung (Bar als Fallback ohne Token). */
  const checkPaymentTokenFor = async (m: PaymentMethod): Promise<boolean> => {
    if (!TOKEN_REQUIRED.includes(m)) return true;
    const token = await AsyncStorage.getItem(`@Onroda_payment_token_${m}`).catch(() => null);
    return !!token;
  };

  /* Pre-Authorization: Betrag reservieren (Platzhalter für echte PayPal/Stripe-Integration) */
  const runPreAuthorization = async (amount: number, pm: PaymentMethod): Promise<boolean> => {
    if (pm !== "paypal" && pm !== "card") return true;
    setPreAuthLoading(true);
    try {
      // TODO: echte Pre-Auth API-Anfrage hier einfügen
      // z.B.: await stripeApi.createPaymentIntent({ amount, currency: "eur", capture_method: "manual" });
      await new Promise((r) => setTimeout(r, 600)); // Simulate network
      return true;
    } catch {
      return false;
    } finally {
      setPreAuthLoading(false);
    }
  };

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

  const handleOrder = async () => {
    if (!fareBreakdown || !paymentMethod) return;
    if (paymentMethod === "voucher") {
      if (!pendingTransportScanId || !transportScanTrafficLight) {
        Alert.alert("Transportschein", "Bitte zuerst den Transportschein scannen.");
        return;
      }
      if (transportScanTrafficLight === "red") {
        Alert.alert(
          "Transportschein",
          "Der Schein wurde als ungültig erkannt. Bitte erneut scannen oder als Selbstzahler (Bar) buchen.",
        );
        return;
      }
    }
    if (paymentMethod === "access_code" && !accessCodeInput.trim()) {
      setShowAccessCodeModal(true);
      Alert.alert("Code fehlt", "Bitte Gutschein- oder Freigabe-Code eingeben.");
      return;
    }
    const isWheelchair = selectedVehicle === "wheelchair";
    if (isWheelchair) {
      if (assistanceLevel == null || canTransfer == null || companionCount == null) {
        Alert.alert(
          "Rollstuhl-Details fehlen",
          "Bitte wähle mindestens Hilfe, Umsteigen (ja/nein) und Begleitperson aus.",
        );
        return;
      }
      if (wheelchairType == null) {
        Alert.alert("Rollstuhl-Details fehlen", "Bitte Rollstuhl-Typ auswählen.");
        return;
      }
    }

    const pm = paymentMethod;

    /* ── 1. Token / Pre-Auth nur bei Online-Zahlung (nicht Bar, Transportschein, Freigabe-Code) ── */
    const skipWalletSteps = pm === "cash" || pm === "voucher" || pm === "access_code";
    if (!skipWalletSteps) {
      const hasToken = await checkPaymentTokenFor(pm);
      if (!hasToken) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTokenErrorMethod(pm);
        setNoTokenVisible(true);
        return;
      }
      const copayment = calculateCopayment(fareBreakdown.total, isExempted);
      const chargeAmount = fareBreakdown.total;
      const preAuthOk = await runPreAuthorization(chargeAmount, pm);
      if (!preAuthOk) {
        Alert.alert("Zahlung fehlgeschlagen", "Die Vorautorisierung konnte nicht durchgeführt werden. Bitte Zahlungsmittel prüfen.");
        return;
      }
    }

    /* ── 2. Buchung absenden ── */
    const copayment = calculateCopayment(fareBreakdown.total, isExempted);
    const chargeAmount = fareBreakdown.total;
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => {
      void (async () => {
        try {
          if (!destination) return;
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

          const originLat = readCoord(origin as unknown, "lat", "latitude");
          const originLon = readCoord(origin as unknown, "lon", "longitude");
          const destinationLat = readCoord(destination as unknown, "lat", "latitude");
          const destinationLon = readCoord(destination as unknown, "lon", "longitude");

          console.log("BOOKING_ADDRESS_DEBUG", {
            originDisplayName: origin?.displayName,
            destinationDisplayName: destination?.displayName,
            originLat,
            originLon,
            destinationLat,
            destinationLon,
            origin,
            destination,
          });

          const hasGeoSelection =
            originLat != null &&
            originLon != null &&
            destinationLat != null &&
            destinationLon != null;
          /**
           * Wenn beide Punkte bereits geokodiert sind (aus Vorschlag/Karte),
           * blockieren wir nicht mehr an der rein textbasierten Hausnummer-Regel.
           * Damit vermeiden wir False-Negatives bei unterschiedlichen Adressformaten.
           */
          if (!hasGeoSelection) {
            const addressCheck = validateAddressCompletenessForBooking(origin.displayName, destination.displayName);
            if (!addressCheck.ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Buchung nicht möglich", addressCheck.message);
              return;
            }
          }
          const area = await validateServiceAreaForBooking(origin.displayName, destination.displayName, {
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const paymentLabel =
            pm === "cash" ? "Bar" :
            pm === "paypal" ? "PayPal" :
            pm === "app" ? "App" :
            pm === "card" ? "Kreditkarte" :
            pm === "access_code" ? "Gutschein / Freigabe (Code)" :
            pm === "voucher"
              ? (isExempted ? "Krankenkasse (Befreit: 0,00 €)" : `Krankenkasse (Eigenanteil: ${formatEuro(copayment)})`)
              : "Bar";
          const vehicleLabel =
            selectedServiceClass ? SERVICE_CLASS_LABELS[selectedServiceClass] :
            selectedVehicle === "standard" ? "Standard" :
            selectedVehicle === "xl" ? "XL" :
            "Rollstuhl";
          const pricingMode = effectivePricingModeForCustomerRide({
            selectedServiceClass,
            selectedVehicle,
            origin,
            destination,
          });
          const noteTrim = customerDriverNote.trim();
          const partnerBookingMetaPayload =
            noteTrim ? { partnerBookingMeta: { customer_driver_note: noteTrim } } : {};
          if (__DEV__) {
            console.log("[RESNOTE] ride.tsx pre addRequest", {
              customerDriverNote: customerDriverNote.slice(0, 120),
              partnerBookingMeta: partnerBookingMetaPayload.partnerBookingMeta,
            });
          }
          const rideRequestId = await addRequest({
            from: origin.displayName.split(",")[0],
            fromFull: origin.displayName,
            to: destination?.displayName.split(",")[0] ?? "Ziel",
            toFull: destination?.displayName ?? "",
            fromLat: originLat ?? undefined,
            fromLon: originLon ?? undefined,
            toLat: destinationLat ?? undefined,
            toLon: destinationLon ?? undefined,
            distanceKm: route?.distanceKm ?? 0,
            durationMinutes: route?.durationMinutes ?? 0,
            estimatedFare: chargeAmount,
            paymentMethod: paymentLabel,
            vehicle: vehicleLabel,
            ...(pricingMode ? { pricingMode } : {}),
            customerName: profile.name
              ? profile.name.split(" ")[0] + " " + (profile.name.split(" ")[1]?.[0] ?? "") + "."
              : "Gast",
            passengerId: passengerId || undefined,
            scheduledAt: scheduledTime ?? null,
            ...partnerBookingMetaPayload,
            ...(pm === "voucher" && pendingTransportScanId
              ? { customerMedicalScanId: pendingTransportScanId, payerKind: "insurance" as const }
              : {}),
            ...(pm === "access_code" && accessCodeInput.trim()
              ? { accessCode: accessCodeInput.trim() }
              : {}),
            ...(isWheelchair
              ? {
                  accessibilityOptions: {
                    assistanceLevel: assistanceLevel as AssistanceLevel,
                    wheelchairType: wheelchairType as WheelchairType,
                    wheelchairStaysOccupied: canTransfer === false,
                    canTransfer: canTransfer as boolean,
                    companionCount: companionCount as CompanionCount,
                    rampRequired,
                    carryChairRequired,
                    elevatorAvailable,
                    stairsPresent,
                    driverNote: accessibilityNote.trim() || null,
                  } satisfies RideAccessibilityOptions,
                }
              : {}),
          });
          router.replace({ pathname: "/status", params: { rideId: rideRequestId } } as any);
        } catch (err) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const code = err instanceof Error ? err.message : "";
          if (code === "medical_transport_scan_rejected") {
            Alert.alert(
              "Transportschein abgelehnt",
              "Die Buchung wurde abgelehnt. Bitte Transportschein erneut prüfen oder Bar wählen.",
            );
            return;
          }
          if (code === "medical_transport_scan_required") {
            Alert.alert("Transportschein", "Bitte zuerst den Transportschein scannen.");
            return;
          }
          Alert.alert(
            "Buchung fehlgeschlagen",
            userFacingBookingErrorMessage(err, accessCodeBookingErrorMessage),
          );
        }
      })();
    });
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetRide();
    router.replace("/");
  };

  const schedDateStr = scheduledTime
    ? scheduledTime.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " · " +
      scheduledTime.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
      " Uhr"
    : null;

  if (!selectedVehicle || !fareBreakdown || !destination) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: 24 }]}>
        <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground, textAlign: "center", marginBottom: 16 }}>
          Buchung unvollständig. Bitte den Buchungsflow über „Weiter zur Buchung“ erneut starten.
        </Text>
        <Pressable
          onPress={handleBack}
          style={{ alignSelf: "center", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary }}
        >
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  const vehicle = VEHICLES.find((v) => v.id === selectedVehicle)!;
  const payerBlock = customerPayerBlockFromBooking(paymentMethod, isExempted);
  const brokerInScroll = paymentMethod === "access_code";
  const scrollBottomInset = brokerInScroll ? bottomPad + rs(118) : bottomPad + rs(200);

  const renderBrokerNotice = () => (
    <Pressable
      onPress={() => setBrokerNoticeExpanded((prev) => !prev)}
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
      <Text
        style={[styles.brokerNoticeText, { color: colors.foreground }]}
        numberOfLines={brokerNoticeExpanded ? 0 : 2}
      >
        {brokerNoticeDe}
      </Text>
      <Feather
        name={brokerNoticeExpanded ? "chevron-down" : "chevron-right"}
        size={16}
        color="#0D9488"
        style={{ marginTop: 2 }}
      />
    </Pressable>
  );

  const renderTaxameterLegalNotice = () => (
    <View style={styles.taxameterNoticeBox}>
      <Feather name="info" size={14} color="#374151" style={{ marginTop: 1 }} />
      <Text style={styles.taxameterNoticeText}>
        <Text style={styles.taxameterNoticeLead}>Schätzpreis – </Text>
        <Text style={styles.taxameterNoticeStrong}>maßgeblich ist der Taxameterpreis.</Text>
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? topPad + 8 : 0}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleBack}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Fahrt bestätigen</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        ref={rideScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomInset }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.locationRow}>
            <View style={[styles.originDot, { backgroundColor: colors.success }]} />
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Abfahrt</Text>
              <Text style={[styles.locationValue, { color: colors.foreground }]}>
                {origin?.displayName ?? "Esslingen am Neckar"}
              </Text>
            </View>
          </View>
          <View style={[styles.routeConnector, { backgroundColor: colors.success }]} />
          <View style={styles.locationRow}>
            <View style={[styles.destPin, { backgroundColor: colors.primary }]}>
              <Feather name="map-pin" size={10} color={colors.primaryForeground} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>Ziel</Text>
              <Text style={[styles.locationValue, { color: colors.foreground }]} numberOfLines={2}>
                {destination?.displayName ?? "–"}
              </Text>
            </View>
          </View>
        </View>
        {selectedVehicle === "wheelchair" ? (
          <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "#86EFAC", backgroundColor: "#F0FDF4", padding: 14, gap: 8 }}>
            <Pressable
              onPress={() => setAccessibilityOpen(true)}
              style={{ borderRadius: 12, backgroundColor: "#16A34A", paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: rf(14) }}>
                Rollstuhl-Details angeben
              </Text>
              <Feather name="chevron-right" size={18} color="#fff" />
            </Pressable>
            <Text style={{ fontSize: rf(12), color: "#166534", fontFamily: "Inter_500Medium" }}>
              {assistanceLevel && canTransfer != null && companionCount != null
                ? `${assistanceLabel(assistanceLevel)} · ${canTransfer ? "Patient kann umsteigen" : "Rollstuhl bleibt genutzt"} · ${companionLabel(companionCount)}`
                : "Pflicht für Rollstuhl-Fahrten: Hilfe, Umsteigen (ja/nein), Begleitperson."}
            </Text>
          </View>
        ) : null}

        {fareBreakdown ? renderTaxameterLegalNotice() : null}

        <View style={[styles.tripSummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { icon: "map" as const, value: `${route?.distanceKm ?? 0} km`, label: "Strecke" },
            { vehicleIcon: vehicle.icon as any, value: vehicle.name, label: "Fahrzeug" },
            { icon: "users" as const, value: `${vehicle.minSeats}`, label: "Plätze" },
          ].map((s) => (
            <View key={s.label} style={styles.tripSummaryItem}>
              <View style={[styles.tripSummaryIcon, { backgroundColor: colors.background }]}>
                {"vehicleIcon" in s ? (
                  <MaterialCommunityIcons name={s.vehicleIcon} size={18} color={colors.primary} />
                ) : (
                  <Feather name={s.icon} size={17} color={colors.primary} />
                )}
              </View>
              <Text style={[styles.statValue, { color: colors.foreground }]} numberOfLines={1}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ZAHLUNGSART WÄHLEN</Text>
          <View style={styles.paymentGrid}>
            {ridePaymentOptions.map((opt) => {
              const isSelected = paymentMethod === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.paymentBtn,
                    {
                      backgroundColor: isSelected ? ONRODA_MARK_RED + "0F" : colors.card,
                      borderColor: isSelected ? ONRODA_MARK_RED : colors.border,
                      borderWidth: isSelected ? 2 : 1.5,
                    },
                  ]}
                  onPress={() => {
                    if (opt.id !== "voucher") {
                      setIsExempted(false);
                      dismissTransportScan();
                    }
                    if (opt.id !== "access_code") {
                      setAccessCodeInput("");
                      setShowAccessCodeModal(false);
                    }
                    setPaymentMethod(opt.id);
                    Haptics.selectionAsync();
                    if (opt.id === "access_code") {
                      setShowAccessCodeModal(true);
                    }
                  }}
                >
                  <View style={styles.paymentBtnLeft}>
                    {opt.isEuro ? (
                      <Text style={[styles.euroSymbol, { color: colors.foreground }]}>€</Text>
                    ) : opt.isApp ? (
                      <Feather name="smartphone" size={14} color={colors.foreground} />
                    ) : opt.isPaypal ? (
                      <Text style={[styles.paypalText, { color: "#1565C0" }]}>P</Text>
                    ) : opt.isCard ? (
                      <Feather name="credit-card" size={14} color={colors.foreground} />
                    ) : opt.isVoucher ? (
                      <MaterialCommunityIcons name="ticket-percent-outline" size={16} color={colors.foreground} />
                    ) : opt.isAccessCode ? (
                      <MaterialCommunityIcons name="shield-check-outline" size={16} color="#15803D" />
                    ) : (
                      <Feather name="credit-card" size={14} color={colors.foreground} />
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
        </View>

        {paymentMethod === "access_code" ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.accessCodeTitleRow}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>GUTSCHEIN / CODE</Text>
              {accessCodeInput.trim().length > 0 ? (
                <Feather name="check-circle" size={18} color="#16A34A" accessibilityLabel="Code eingetragen" />
              ) : null}
            </View>
            <Pressable
              style={[styles.accessCodeField, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
              onPress={() => setShowAccessCodeModal(true)}
            >
              <MaterialCommunityIcons name="shield-check-outline" size={18} color="#15803D" />
              <Text
                style={[
                  styles.accessCodeFieldText,
                  { color: accessCodeInput.trim() ? colors.foreground : colors.mutedForeground },
                ]}
                numberOfLines={2}
              >
                {accessCodeInput.trim() ? accessCodeInput.trim() : "Code eingeben"}
              </Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            {brokerInScroll ? renderBrokerNotice() : null}
          </View>
        ) : null}

        {paymentMethod === "voucher" ? (
          <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF", padding: 16, gap: 10 }}>
            <Text style={[styles.cardLabel, { color: "#1D4ED8" }]}>TRANSPORTSCHEIN (KK)</Text>
            <Pressable
              style={[styles.transportScanBtn, transportScanBusy && { opacity: 0.65 }]}
              disabled={transportScanBusy || preAuthLoading}
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
                  <Text style={{ fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#1D4ED8", lineHeight: 18 }}>
                    Fahrer prüft vor Ort nochmals — letzte Entscheidung beim Fahrer.
                  </Text>
                ) : null}
                {transportScanTrafficLight === "yellow" ? (
                  <Text style={{ fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#B45309", lineHeight: 18 }}>
                    Letzte Entscheidung beim Fahrer.
                  </Text>
                ) : null}
                {transportScanTrafficLight === "red" ? (
                  <>
                    <Text style={{ fontSize: rf(12), fontFamily: "Inter_600SemiBold", color: "#B91C1C", lineHeight: 18 }}>
                      Schein ungültig — weiter als Selbstzahler?
                    </Text>
                    <Pressable style={styles.selfPaySwitchBtn} onPress={switchVoucherToSelfPay}>
                      <Text style={styles.selfPaySwitchBtnText}>Stattdessen Bar zahlen</Text>
                    </Pressable>
                  </>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#2563EB", lineHeight: 17 }}>
                Bitte Transportschein scannen, um die Buchung freizugeben.
              </Text>
            )}
            <View style={styles.paymentChip}>
              <MaterialCommunityIcons name="ticket-percent-outline" size={20} color="#2563EB" />
              <Text style={[styles.paymentChipText, { color: "#1D4ED8" }]}>Eigenanteil (Schätzung)</Text>
            </View>
            <Text style={{ fontSize: rf(22), fontFamily: "Inter_700Bold", color: "#1D4ED8" }}>
              {fareBreakdown ? formatEuro(calculateCopayment(fareBreakdown.total, isExempted)) : "–"}
              {isExempted ? "  (befreit)" : ""}
            </Text>
            {fareBreakdown ? renderTaxameterLegalNotice() : null}
            <Pressable
              style={styles.exemptRow}
              onPress={() => {
                setIsExempted(!isExempted);
                Haptics.selectionAsync();
              }}
            >
              <View
                style={[
                  styles.exemptCheckbox,
                  {
                    borderColor: isExempted ? "#2563EB" : "#93C5FD",
                    backgroundColor: isExempted ? "#2563EB" : "transparent",
                  },
                ]}
              >
                {isExempted && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={[styles.exemptText, { color: "#1D4ED8" }]}>Ich bin von der Zuzahlung befreit</Text>
            </Pressable>
          </View>
        ) : null}

        {schedDateStr && (
          <View style={[styles.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <Text style={[styles.cardLabel, { color: "#D97706" }]}>VORBESTELLUNG</Text>
            <View style={styles.paymentChip}>
              <Feather name="calendar" size={18} color="#D97706" />
              <Text style={[styles.paymentChipText, { color: colors.foreground }]}>{schedDateStr}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: bottomPad + 16 }]}>
        {!brokerInScroll ? renderBrokerNotice() : null}
        <View style={styles.bottomContent}>
          {paymentMethod === "voucher" ? (
            <View style={[styles.priceBox, { borderColor: "#93C5FD", backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.bottomLabel, { color: "#2563EB" }]}>Eigenanteil</Text>
              <Text style={[styles.bottomPrice, { color: "#2563EB" }]}>
                {fareBreakdown ? formatEuro(calculateCopayment(fareBreakdown.total, isExempted)) : "–"}
              </Text>
            </View>
          ) : paymentMethod === "access_code" ? (
            <View style={[styles.priceBox, { borderColor: "#86EFAC", backgroundColor: "#F0FDF4" }]}>
              <Text style={[styles.bottomLabel, { color: "#15803D" }]}>Abrechnung</Text>
              <Text style={[styles.bottomPrice, { fontSize: rf(14), color: "#166534" }]}>
                über Code
              </Text>
            </View>
          ) : (
            <View style={[styles.priceBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.bottomLabel, { color: colors.mutedForeground }]}>Schätzpreis</Text>
              <Text style={[styles.bottomPrice, { color: colors.foreground }]}>
                {formatEuro(fareBreakdown.total)}
              </Text>
            </View>
          )}
          <Animated.View style={{ transform: [{ scale: btnScale }], flex: 1 }}>
            <Pressable
              style={[
                styles.orderBtn,
                {
                  backgroundColor: canPlaceOrder ? "#16A34A" : colors.muted,
                  opacity: canPlaceOrder ? 1 : 0.85,
                },
              ]}
              onPress={handleOrder}
              disabled={!canPlaceOrder}
            >
              <View style={styles.orderBtnInner}>
                <Text
                  style={[
                    styles.orderBtnText,
                    { color: canPlaceOrder ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {orderCtaLabel}
                </Text>
                <Feather name="arrow-right" size={16} color={canPlaceOrder ? "#fff" : colors.mutedForeground} />
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* ── Kein Zahlungsmittel hinterlegt ── */}
      <Modal
        visible={accessibilityOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAccessibilityOpen(false)}
      >
        <Pressable style={styles.noTokenOverlay} onPress={() => setAccessibilityOpen(false)}>
          <Pressable
            style={[styles.noTokenCard, { backgroundColor: colors.surface, borderColor: colors.border, gap: 10, maxHeight: "88%" }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.noTokenTitle, { color: colors.foreground }]}>Rollstuhl-Details</Text>
            <ScrollView
              ref={accessibilityScrollRef}
              style={{ alignSelf: "stretch" }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
            >
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Hilfe benötigt?</Text>
              {([
                ["boarding", "Ich brauche Hilfe beim Einsteigen"],
                ["to_door", "Ich brauche Hilfe bis zur Haustür"],
                ["to_apartment", "Ich brauche Hilfe bis in die Wohnung"],
                ["none", "Keine Hilfe nötig"],
              ] as const).map(([id, label]) => (
                <Pressable key={id} onPress={() => setAssistanceLevel(id)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name={assistanceLevel === id ? "check-circle" : "circle"} size={16} color={assistanceLevel === id ? "#16A34A" : colors.mutedForeground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>{label}</Text>
                </Pressable>
              ))}
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Rollstuhl-Typ</Text>
              {([
                ["foldable", "faltbarer Rollstuhl"],
                ["electric", "elektrischer Rollstuhl"],
              ] as const).map(([id, label]) => (
                <Pressable key={id} onPress={() => setWheelchairType(id)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name={wheelchairType === id ? "check-circle" : "circle"} size={16} color={wheelchairType === id ? "#16A34A" : colors.mutedForeground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>{label}</Text>
                </Pressable>
              ))}
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Fahrtposition</Text>
              <Pressable onPress={() => setCanTransfer(false)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name={canTransfer === false ? "check-circle" : "circle"} size={16} color={canTransfer === false ? "#16A34A" : colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>Rollstuhl bleibt während der Fahrt genutzt</Text>
              </Pressable>
              <Pressable onPress={() => setCanTransfer(true)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name={canTransfer === true ? "check-circle" : "circle"} size={16} color={canTransfer === true ? "#16A34A" : colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>Patient kann umsteigen</Text>
              </Pressable>
              <Pressable onPress={() => setCanTransfer(false)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name={canTransfer === false ? "check-circle" : "circle"} size={16} color={canTransfer === false ? "#16A34A" : colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>Patient kann nicht umsteigen</Text>
              </Pressable>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Begleitperson</Text>
              {([
                [0, "keine Begleitperson"],
                [1, "1 Begleitperson"],
                [2, "2 Begleitpersonen"],
              ] as const).map(([val, label]) => (
                <Pressable key={val} onPress={() => setCompanionCount(val)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name={companionCount === val ? "check-circle" : "circle"} size={16} color={companionCount === val ? "#16A34A" : colors.mutedForeground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>{label}</Text>
                </Pressable>
              ))}
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Besonderheiten</Text>
              {([
                [rampRequired, setRampRequired, "Rampe erforderlich"],
                [carryChairRequired, setCarryChairRequired, "Tragestuhl erforderlich"],
                [elevatorAvailable, setElevatorAvailable, "Aufzug vorhanden"],
                [stairsPresent, setStairsPresent, "Treppen vorhanden"],
              ] as const).map(([flag, setter, label]) => (
                <Pressable key={label} onPress={() => setter(!flag)} style={{ paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name={flag ? "check-square" : "square"} size={16} color={flag ? "#16A34A" : colors.mutedForeground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: rf(13) }}>{label}</Text>
                </Pressable>
              ))}
              <TextInput
                value={accessibilityNote}
                onChangeText={setAccessibilityNote}
                onFocus={handleAccessibilityNoteFocus}
                placeholder="Hinweis an Fahrer (optional)"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, minHeight: 72 }}
              />
            </ScrollView>
            <Pressable style={[styles.noTokenBtn, { backgroundColor: "#16A34A" }]} onPress={() => setAccessibilityOpen(false)}>
              <Text style={styles.noTokenBtnText}>Übernehmen</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AccessCodeModal
        visible={showAccessCodeModal}
        value={accessCodeInput}
        onClose={() => setShowAccessCodeModal(false)}
        onConfirm={(code) => {
          setAccessCodeInput(code);
          setShowAccessCodeModal(false);
        }}
        colors={colors}
      />

      <Modal
        visible={noTokenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setNoTokenVisible(false); setTokenErrorMethod(null); }}
      >
        <View style={styles.noTokenOverlay}>
          <View style={[styles.noTokenCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.noTokenIcon, { backgroundColor: "#FEF2F2" }]}>
              <Feather name="credit-card" size={28} color="#DC2626" />
            </View>
            <Text style={[styles.noTokenTitle, { color: colors.foreground }]}>
              Kein Zahlungsmittel hinterlegt
            </Text>
            <Text style={[styles.noTokenBody, { color: colors.mutedForeground }]}>
              Für die Zahlung per {tokenErrorMethod ? PAYMENT_LABELS[tokenErrorMethod] : "dieser Methode"} muss ein Konto in der Geldbörse verknüpft sein.
            </Text>
            <Pressable
              style={[styles.noTokenBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => { setNoTokenVisible(false); setTokenErrorMethod(null); router.push("/wallet"); }}
            >
              <Feather name="credit-card" size={15} color="#fff" />
              <Text style={styles.noTokenBtnText}>Zur Geldbörse</Text>
            </Pressable>
            <Pressable onPress={() => { setNoTokenVisible(false); setTokenErrorMethod(null); }} style={styles.noTokenCancel}>
              <Text style={[styles.noTokenCancelText, { color: colors.mutedForeground }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: rs(18), paddingBottom: rs(14), borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: rs(36), height: rs(36), borderRadius: rs(18), justifyContent: "center", alignItems: "center", borderWidth: 1 },
  headerTitle: { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: rs(18), paddingTop: rs(16), gap: rs(12) },
  card: { borderRadius: rs(16), borderWidth: 1, padding: rs(18), gap: rs(12) },
  cardLabel: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: rs(12) },
  originDot: { width: rs(14), height: rs(14), borderRadius: rs(7), marginTop: 3 },
  destPin: { width: rs(20), height: rs(20), borderRadius: rs(10), justifyContent: "center", alignItems: "center", marginTop: 2 },
  locationInfo: { flex: 1, gap: rs(2) },
  locationLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  locationValue: { fontSize: rf(15), fontFamily: "Inter_500Medium", lineHeight: rf(22) },
  routeConnector: { width: 2, height: rs(22), borderRadius: rs(2), marginLeft: rs(6), alignSelf: "flex-start" },
  taxameterNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    backgroundColor: "#F3F4F6",
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
  },
  taxameterNoticeText: { flex: 1, fontSize: rf(12), lineHeight: rf(17) },
  taxameterNoticeLead: { fontFamily: "Inter_500Medium", color: "#4B5563" },
  taxameterNoticeStrong: { fontFamily: "Inter_700Bold", color: "#111827" },
  tripSummaryCard: { flexDirection: "row", borderRadius: rs(18), borderWidth: 1, paddingVertical: rs(14), paddingHorizontal: rs(8), gap: rs(4) },
  tripSummaryItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(5), minWidth: 0 },
  tripSummaryIcon: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: rf(15), fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: rs(12) },
  vehicleIcon: { width: rs(44), height: rs(44), borderRadius: rs(12), justifyContent: "center", alignItems: "center" },
  vehicleName: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  vehicleDesc: { fontSize: rf(13), fontFamily: "Inter_400Regular" },
  paymentChip: { flexDirection: "row", alignItems: "center", gap: rs(10) },
  paymentChipText: { fontSize: rf(15), fontFamily: "Inter_500Medium" },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", gap: rs(8), marginTop: rs(4) },
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
  paymentCheck: {
    width: rs(18),
    height: rs(18),
    borderRadius: rs(9),
    backgroundColor: ONRODA_MARK_RED,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentBtnText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  euroSymbol: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  paypalText: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  exemptRow: { flexDirection: "row", alignItems: "center", gap: rs(10), marginTop: rs(4) },
  exemptCheckbox: { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  exemptText: { flex: 1, fontSize: rf(13), fontFamily: "Inter_500Medium" },
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
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: rs(14), paddingHorizontal: rs(18),
    gap: rs(12),
  },
  brokerNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  brokerNoticeText: { flex: 1, fontSize: rf(11), fontFamily: "Inter_400Regular", lineHeight: rf(16) },
  bottomContent: { flexDirection: "row", alignItems: "stretch", gap: rs(12) },
  priceBox: {
    borderWidth: 1.5,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    gap: rs(2),
    minHeight: rs(56),
    justifyContent: "center",
  },
  bottomLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  bottomPrice: { fontSize: rf(22), fontFamily: "Inter_700Bold" },
  orderBtn: { flex: 1.15, paddingVertical: rs(15), borderRadius: rs(14), alignItems: "center", justifyContent: "center", minHeight: rs(56) },
  orderBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingHorizontal: rs(14) },
  orderBtnText: { fontSize: rf(17), fontFamily: "Inter_700Bold", textAlign: "center" },
  noTokenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: rs(24) },
  noTokenCard: { width: "100%", borderRadius: rs(20), borderWidth: 1, padding: rs(24), alignItems: "center", gap: rs(12) },
  noTokenIcon: { width: rs(60), height: rs(60), borderRadius: rs(18), justifyContent: "center", alignItems: "center", marginBottom: rs(4) },
  noTokenTitle: { fontSize: rf(18), fontFamily: "Inter_700Bold", textAlign: "center" },
  noTokenBody: { fontSize: rf(14), fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: rf(20) },
  noTokenBtn: { flexDirection: "row", alignItems: "center", gap: rs(8), paddingVertical: rs(14), paddingHorizontal: rs(28), borderRadius: rs(14), marginTop: rs(4), width: "100%", justifyContent: "center" },
  noTokenBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
  noTokenCancel: { paddingVertical: rs(8) },
  noTokenCancelText: { fontSize: rf(14), fontFamily: "Inter_400Regular" },
  accessCodeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: rs(8),
  },
  accessCodeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(14),
    marginTop: rs(4),
  },
  accessCodeFieldText: { flex: 1, fontSize: rf(15), fontFamily: "Inter_500Medium", lineHeight: rf(21) },
});

const accessCodeModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#00000055",
    paddingHorizontal: rs(24),
  },
  overlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  card: {
    width: "100%",
    maxWidth: rs(360),
    borderRadius: rs(20),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity: 0.15,
    shadowRadius: rs(24),
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  headerAction: { fontSize: rf(15), fontFamily: "Inter_500Medium" },
  body: { paddingHorizontal: rs(16), paddingTop: rs(14), paddingBottom: rs(16), gap: rs(10) },
  hint: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
  input: {
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    fontSize: rf(16),
    fontFamily: "Inter_600SemiBold",
  },
});
