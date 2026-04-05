import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { calculateCopayment, type PaymentMethod, VEHICLES, useRide } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { rs, rf } from "@/utils/scale";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { formatEuro } from "@/utils/fareCalculator";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Bar",
  paypal: "PayPal",
  card: "Kreditkarte",
  voucher: "Transportschein",
  app: "App",
};

/* Zahlungsmethoden, die einen hinterlegten Token benötigen */
const TOKEN_REQUIRED: PaymentMethod[] = ["paypal", "card", "app"];

export default function RideScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { origin, destination, route, fareBreakdown, selectedVehicle, paymentMethod, isExempted, scheduledTime } = useRide();
  const { addRequest, passengerId } = useRideRequests();
  const { profile } = useUser();
  const vehicle = VEHICLES.find((v) => v.id === selectedVehicle)!;
  const btnScale = useRef(new Animated.Value(1)).current;

  const [noTokenVisible, setNoTokenVisible] = useState(false);
  const [preAuthLoading, setPreAuthLoading] = useState(false);

  /* Prüft ob ein Payment-Token für die gewählte Methode hinterlegt ist */
  const checkPaymentToken = async (): Promise<boolean> => {
    if (!paymentMethod || !TOKEN_REQUIRED.includes(paymentMethod)) return true;
    const token = await AsyncStorage.getItem(`@Onroda_payment_token_${paymentMethod}`).catch(() => null);
    return !!token;
  };

  /* Pre-Authorization: Betrag reservieren (Platzhalter für echte PayPal/Stripe-Integration) */
  const runPreAuthorization = async (amount: number): Promise<boolean> => {
    if (paymentMethod !== "paypal" && paymentMethod !== "card") return true;
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
    if (!fareBreakdown) return;

    /* ── 1. Token-Validierung ── */
    const hasToken = await checkPaymentToken();
    if (!hasToken) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setNoTokenVisible(true);
      return;
    }

    /* ── 2. Pre-Authorization ── */
    const copayment = calculateCopayment(fareBreakdown.total, isExempted);
    const chargeAmount = paymentMethod === "voucher" ? copayment : fareBreakdown.total;
    const preAuthOk = await runPreAuthorization(chargeAmount);
    if (!preAuthOk) {
      Alert.alert("Zahlung fehlgeschlagen", "Die Vorautorisierung konnte nicht durchgeführt werden. Bitte Zahlungsmittel prüfen.");
      return;
    }

    /* ── 3. Buchung absenden ── */
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const paymentLabel =
        paymentMethod === "cash" ? "Bar" :
        paymentMethod === "paypal" ? "PayPal" :
        paymentMethod === "app" ? "App" :
        paymentMethod === "card" ? "Kreditkarte" :
        paymentMethod === "voucher"
          ? (isExempted ? "Krankenkasse (Befreit: 0,00 €)" : `Krankenkasse (Eigenanteil: ${formatEuro(copayment)})`)
          : "Bar";
      const vehicleLabel = selectedVehicle === "standard" ? "Standard" : selectedVehicle === "xl" ? "XL" : "Rollstuhl";
      await addRequest({
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
        customerName: profile.name
          ? profile.name.split(" ")[0] + " " + (profile.name.split(" ")[1]?.[0] ?? "") + "."
          : "Gast",
        passengerId: passengerId || undefined,
        scheduledAt: scheduledTime ?? null,
      });
      router.replace("/my-rides");
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        showsVerticalScrollIndicator={false}
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
            <View style={[styles.vehicleIcon, { backgroundColor: selectedVehicle === "wheelchair" ? "#E0F2FE" : colors.primary + "18" }]}>
              <MaterialCommunityIcons name={vehicle.icon as any} size={22} color={selectedVehicle === "wheelchair" ? "#0369A1" : colors.primary} />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={[styles.vehicleName, { color: colors.foreground }]}>{vehicle.name}</Text>
              <Text style={[styles.vehicleDesc, { color: colors.mutedForeground }]}>{vehicle.description}</Text>
            </View>
          </View>
        </View>

        {paymentMethod === "voucher" ? (
          <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "#93C5FD", backgroundColor: "#EFF6FF", padding: 16, gap: 10 }}>
            <Text style={[styles.cardLabel, { color: "#1D4ED8" }]}>ZAHLUNG – KRANKENKASSE</Text>
            <View style={styles.paymentChip}>
              <MaterialCommunityIcons name="ticket-percent-outline" size={20} color="#2563EB" />
              <Text style={[styles.paymentChipText, { color: "#1D4ED8" }]}>Transportschein</Text>
            </View>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "#93C5FD" }} />
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#2563EB", lineHeight: 17 }}>
              {isExempted
                ? "Sie sind von der Zuzahlung befreit (0,00 €). Bitte Befreiungsnachweis bereithalten."
                : "Bitte halten Sie Ihren genehmigten Transportschein beim Fahrer bereit. Der Restbetrag wird direkt mit Ihrer Krankenkasse abgerechnet."}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ZAHLUNG</Text>
            <View style={styles.paymentChip}>
              {paymentMethod === "paypal" ? (
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#1565C0" }}>P</Text>
              ) : paymentMethod === "card" ? (
                <Feather name="credit-card" size={18} color={colors.primary} />
              ) : (
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primary }}>€</Text>
              )}
              <Text style={[styles.paymentChipText, { color: colors.foreground }]}>
                {paymentMethod ? PAYMENT_LABELS[paymentMethod] : ""}
              </Text>
            </View>
          </View>
        )}

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
          ) : (
            <View style={[styles.priceBox, { borderColor: "#D1D5DB", backgroundColor: "#F3F4F6" }]}>
              <Text style={[styles.bottomLabel, { color: colors.mutedForeground }]}>Schätzpreis Taxameter</Text>
              <Text style={[styles.bottomPrice, { color: colors.foreground }]}>
                {fareBreakdown
                  ? `${Math.round(fareBreakdown.total / 1.08)} – ${Math.round(fareBreakdown.total)} €`
                  : "–"}
              </Text>
            </View>
          )}
          <Animated.View style={{ transform: [{ scale: btnScale }], flex: 1 }}>
            <Pressable
              style={[styles.orderBtn, { backgroundColor: preAuthLoading ? colors.muted : colors.success }]}
              onPress={handleOrder}
              disabled={preAuthLoading}
            >
              <Text style={[styles.orderBtnText, { color: preAuthLoading ? colors.mutedForeground : "#fff" }]}>
                {preAuthLoading ? "Vorautorisierung…" : "Jetzt zahlungspflichtig bestellen"}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* ── Kein Zahlungsmittel hinterlegt ── */}
      <Modal visible={noTokenVisible} transparent animationType="fade" onRequestClose={() => setNoTokenVisible(false)}>
        <View style={styles.noTokenOverlay}>
          <View style={[styles.noTokenCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.noTokenIcon, { backgroundColor: "#FEF2F2" }]}>
              <Feather name="credit-card" size={28} color="#DC2626" />
            </View>
            <Text style={[styles.noTokenTitle, { color: colors.foreground }]}>
              Kein Zahlungsmittel hinterlegt
            </Text>
            <Text style={[styles.noTokenBody, { color: colors.mutedForeground }]}>
              Für die Zahlung per {paymentMethod ? PAYMENT_LABELS[paymentMethod] : ""} muss ein Konto in der Geldbörse verknüpft sein.
            </Text>
            <Pressable
              style={[styles.noTokenBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => { setNoTokenVisible(false); router.push("/wallet"); }}
            >
              <Feather name="credit-card" size={15} color="#fff" />
              <Text style={styles.noTokenBtnText}>Zur Geldbörse</Text>
            </Pressable>
            <Pressable onPress={() => setNoTokenVisible(false)} style={styles.noTokenCancel}>
              <Text style={[styles.noTokenCancelText, { color: colors.mutedForeground }]}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
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
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: rs(16), paddingHorizontal: rs(20),
  },
  bottomContent: { flexDirection: "row", alignItems: "center", gap: rs(16) },
  priceBox: { borderWidth: 1.5, borderRadius: rs(12), paddingHorizontal: rs(12), paddingVertical: rs(8), gap: rs(2) },
  bottomLabel: { fontSize: rf(11), fontFamily: "Inter_400Regular" },
  bottomPrice: { fontSize: rf(22), fontFamily: "Inter_700Bold" },
  orderBtn: { flex: 1, paddingVertical: rs(17), borderRadius: rs(14), alignItems: "center", justifyContent: "center" },
  orderBtnText: { fontSize: rf(14), fontFamily: "Inter_600SemiBold", textAlign: "center" },
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
