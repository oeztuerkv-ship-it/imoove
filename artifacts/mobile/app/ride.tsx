import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
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
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useColors } from "@/hooks/useColors";
import { customerPayerBlockFromBooking } from "@/utils/customerBillingCopy";
import { formatEuro } from "@/utils/fareCalculator";
import type { RideAccessibilityOptions } from "@/context/RideRequestContext";

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
  isVoucher?: boolean;
  isApp?: boolean;
  isAccessCode?: boolean;
}[] = [
  { id: "app", label: "App bezahlen", isApp: true },
  { id: "cash", label: "Bar", isEuro: true },
  { id: "paypal", label: "PayPal", isPaypal: true },
  { id: "voucher", label: "Transportschein", isVoucher: true },
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

export default function RideScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

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
    setPaymentMethod,
    setIsExempted,
  } = useRide();
  const { addRequest, passengerId } = useRideRequests();
  const { profile } = useUser();
  const btnScale = useRef(new Animated.Value(1)).current;
  const rideScrollRef = useRef<ScrollView>(null);

  const [noTokenVisible, setNoTokenVisible] = useState(false);
  const [preAuthLoading, setPreAuthLoading] = useState(false);
  const [tokenErrorMethod, setTokenErrorMethod] = useState<PaymentMethod | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState("");
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

  useEffect(() => {
    if (paymentMethod == null) setPaymentMethod("cash");
  }, [paymentMethod, setPaymentMethod]);

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

  const handleOrder = async () => {
    if (!fareBreakdown || !paymentMethod) return;
    if (paymentMethod === "access_code" && !accessCodeInput.trim()) {
      Alert.alert("Code fehlt", "Bitte geben Sie den Gutschein- oder Freigabe-Code ein.");
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
          const addressCheck = validateAddressCompletenessForBooking(origin.displayName, destination.displayName);
          if (!addressCheck.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Buchung nicht möglich", addressCheck.message);
            return;
          }
          const area = await validateServiceAreaForBooking(origin.displayName, destination.displayName, {
            fromLat: origin.lat,
            fromLon: origin.lon,
            toLat: destination.lat,
            toLon: destination.lon,
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
          const rideRequestId = await addRequest({
            from: origin.displayName.split(",")[0],
            fromFull: origin.displayName,
            to: destination?.displayName.split(",")[0] ?? "Ziel",
            toFull: destination?.displayName ?? "",
            fromLat: origin.lat,
            fromLon: origin.lon,
            toLat: destination?.lat,
            toLon: destination?.lon,
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
    router.back();
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
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Fahrt bestätigen</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={rideScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 130 }]}
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
          <View style={[styles.routeConnector, { backgroundColor: colors.border }]} />
          <View style={styles.locationRow}>
            <View style={[styles.destPin, { backgroundColor: colors.primary }]}>
              <Feather name="map-pin" size={11} color={colors.primaryForeground} />
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

        <View style={styles.statsRow}>
          {[
            { icon: "map" as const, value: `${route?.distanceKm ?? 0} km`, label: "Strecke" },
            { icon: "users" as const, value: `${vehicle.minSeats}`, label: "Plätze" },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={s.icon} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>FAHRZEUG</Text>
          <View style={styles.vehicleRow}>
            <View style={[styles.vehicleIcon, {
              backgroundColor: selectedVehicle === "wheelchair" ? "#E0F2FE" : "#F3F4F6",
            }]}
            >
              <MaterialCommunityIcons
                name={vehicle.icon as any}
                size={22}
                color={selectedVehicle === "wheelchair" ? "#0369A1" : "#171717"}
              />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={[styles.vehicleName, { color: colors.foreground }]}>{vehicle.name}</Text>
              <Text style={[styles.vehicleDesc, { color: colors.mutedForeground }]}>{vehicle.description}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1" }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>WER ZAHLT?</Text>
          <Text style={{ fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{payerBlock.title}</Text>
          <Text style={{ fontSize: rf(13), fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: rf(19) }}>
            {payerBlock.subtitle}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ZAHLUNGSART WÄHLEN</Text>
          <View style={styles.paymentGrid}>
            {RIDE_PAYMENT_OPTIONS.map((opt) => {
              const isSelected = paymentMethod === opt.id;
              const voucherBlockedByOnroda = false;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.paymentBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: isSelected ? 2 : 1.5,
                      opacity: voucherBlockedByOnroda ? 0.45 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (voucherBlockedByOnroda) {
                    }
                    if (opt.id !== "voucher") setIsExempted(false);
                    if (opt.id !== "access_code") setAccessCodeInput("");
                    setPaymentMethod(opt.id);
                    Haptics.selectionAsync();
                  }}
                >
                  {opt.isEuro ? (
                    <Text style={[styles.euroSymbol, { color: colors.foreground }]}>€</Text>
                  ) : opt.isApp ? (
                    <Feather name="smartphone" size={14} color={colors.foreground} />
                  ) : opt.isPaypal ? (
                    <Text style={[styles.paypalText, { color: "#1565C0" }]}>P</Text>
                  ) : opt.isVoucher ? (
                    <MaterialCommunityIcons name="ticket-percent-outline" size={16} color={colors.foreground} />
                  ) : opt.isAccessCode ? (
                    <MaterialCommunityIcons name="shield-check-outline" size={16} color="#15803D" />
                  ) : (
                    <Feather name="credit-card" size={14} color={colors.foreground} />
                  )}
                  <Text style={[styles.paymentBtnText, { color: colors.foreground }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {paymentMethod === "access_code" ? (
          <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "#86EFAC", backgroundColor: "#F0FDF4", padding: 16, gap: 10 }}>
            <Text style={[styles.cardLabel, { color: "#15803D" }]}>CODE EINGEBEN</Text>
            <Text style={{ fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#166534", lineHeight: rf(19) }}>
              Den Code erhalten Sie z. B. von Hotel, Firma oder Krankenhaus. Er wird bei der Buchung geprüft und mit dieser Fahrt verknüpft.
            </Text>
            <TextInput
              value={accessCodeInput}
              onChangeText={setAccessCodeInput}
              placeholder="Freigabe- oder Gutscheincode"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              onFocus={() => {
                setTimeout(() => {
                  rideScrollRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
              style={{
                borderWidth: 1.5,
                borderColor: "#86EFAC",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: rf(16),
                fontFamily: "Inter_600SemiBold",
                color: colors.foreground,
                backgroundColor: colors.card,
              }}
            />
          </View>
        ) : null}

        {paymentMethod === "voucher" ? (
          <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF", padding: 16, gap: 10 }}>
            <Text style={[styles.cardLabel, { color: "#1D4ED8" }]}>TRANSPORTSCHEIN</Text>
            <View style={styles.paymentChip}>
              <MaterialCommunityIcons name="ticket-percent-outline" size={20} color="#2563EB" />
              <Text style={[styles.paymentChipText, { color: "#1D4ED8" }]}>Eigenanteil (Schätzung)</Text>
            </View>
            <Text style={{ fontSize: rf(22), fontFamily: "Inter_700Bold", color: "#1D4ED8" }}>
              {fareBreakdown ? formatEuro(calculateCopayment(fareBreakdown.total, isExempted)) : "–"}
              {isExempted ? "  (befreit)" : ""}
            </Text>
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
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#2563EB", lineHeight: 17 }}>
              Gültigen Transportschein beim Fahrer bereithalten. Der Restbetrag wird mit der Krankenkasse abgerechnet.
            </Text>
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
            <View style={[styles.priceBox, { borderColor: ONRODA_MARK_RED + "66", backgroundColor: ONRODA_MARK_RED + "12" }]}>
              <Text style={[styles.bottomLabel, { color: ONRODA_MARK_RED }]}>Schätzpreis</Text>
              <Text style={[styles.bottomPrice, { color: ONRODA_MARK_RED }]}>
                {`${Math.round(fareBreakdown.total / 1.08)}–${Math.round(fareBreakdown.total)} €`}
              </Text>
            </View>
          )}
          <Animated.View style={{ transform: [{ scale: btnScale }], flex: 1 }}>
            <Pressable
              style={[
                styles.orderBtn,
                {
                  backgroundColor: preAuthLoading || !paymentMethod ? colors.muted : colors.success,
                  opacity: !paymentMethod ? 0.85 : 1,
                },
              ]}
              onPress={handleOrder}
              disabled={preAuthLoading || !paymentMethod}
            >
              <Text
                style={[
                  styles.orderBtnText,
                  { color: preAuthLoading || !paymentMethod ? colors.mutedForeground : "#fff" },
                ]}
              >
                {preAuthLoading ? "Vorautorisierung…" : rideConfirmCtaLabel(selectedVehicle, scheduledTime !== null)}
              </Text>
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
            <ScrollView style={{ alignSelf: "stretch" }} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
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
    paddingHorizontal: rs(20), paddingBottom: rs(16), borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: rs(40), height: rs(40), borderRadius: rs(20), justifyContent: "center", alignItems: "center", borderWidth: 1 },
  headerTitle: { fontSize: rf(18), fontFamily: "Inter_600SemiBold" },
  content: { padding: rs(20), gap: rs(14) },
  card: { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(10) },
  cardLabel: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: rs(12) },
  originDot: { width: rs(14), height: rs(14), borderRadius: rs(7), marginTop: 3 },
  destPin: { width: rs(22), height: rs(22), borderRadius: rs(11), justifyContent: "center", alignItems: "center", marginTop: 2 },
  locationInfo: { flex: 1, gap: rs(2) },
  locationLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  locationValue: { fontSize: rf(15), fontFamily: "Inter_500Medium", lineHeight: rf(22) },
  routeConnector: { width: 1, height: rs(20), marginLeft: rs(6) },
  statsRow: { flexDirection: "row", gap: rs(10) },
  statCard: { flex: 1, borderRadius: rs(14), borderWidth: 1, padding: rs(14), alignItems: "center", gap: rs(5) },
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
    gap: rs(6),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    minWidth: "47%",
    flexGrow: 1,
  },
  paymentBtnText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  euroSymbol: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  paypalText: { fontSize: rf(14), fontFamily: "Inter_700Bold" },
  exemptRow: { flexDirection: "row", alignItems: "center", gap: rs(10), marginTop: rs(4) },
  exemptCheckbox: { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 2, justifyContent: "center", alignItems: "center" },
  exemptText: { flex: 1, fontSize: rf(13), fontFamily: "Inter_500Medium" },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: rs(16), paddingHorizontal: rs(20),
  },
  bottomContent: { flexDirection: "row", alignItems: "center", gap: rs(16) },
  priceBox: { borderWidth: 1.5, borderRadius: rs(12), paddingHorizontal: rs(12), paddingVertical: rs(8), gap: rs(2) },
  bottomLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  bottomPrice: { fontSize: rf(22), fontFamily: "Inter_700Bold" },
  orderBtn: { flex: 1, paddingVertical: rs(12), borderRadius: rs(12), alignItems: "center", justifyContent: "center" },
  orderBtnText: { fontSize: rf(13), fontFamily: "Inter_700Bold", textAlign: "center" },
  noTokenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: rs(24) },
  noTokenCard: { width: "100%", borderRadius: rs(20), borderWidth: 1, padding: rs(24), alignItems: "center", gap: rs(12) },
  noTokenIcon: { width: rs(60), height: rs(60), borderRadius: rs(18), justifyContent: "center", alignItems: "center", marginBottom: rs(4) },
  noTokenTitle: { fontSize: rf(18), fontFamily: "Inter_700Bold", textAlign: "center" },
  noTokenBody: { fontSize: rf(14), fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: rf(20) },
  noTokenBtn: { flexDirection: "row", alignItems: "center", gap: rs(8), paddingVertical: rs(14), paddingHorizontal: rs(28), borderRadius: rs(14), marginTop: rs(4), width: "100%", justifyContent: "center" },
  noTokenBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
  noTokenCancel: { paddingVertical: rs(8) },
  noTokenCancelText: { fontSize: rf(14), fontFamily: "Inter_400Regular" },
});
