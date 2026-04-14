import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
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

import { RealMapView } from "@/components/RealMapView";
import { useDriver } from "@/context/DriverContext";
import { type PaymentMethod, useRide } from "@/context/RideContext";
import { type RideRequest, useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { customerPayerBlockFromRideRequest } from "@/utils/customerBillingCopy";
import { formatEuro } from "@/utils/fareCalculator";
import { rs, rf } from "@/utils/scale";
import { connectToRide, disconnectSocket, sendCustomerLocation } from "@/utils/socket";

const FALLBACK_DRIVER = {
  name: "Vedat Öztürk",
  firstName: "Vedat",
  car: "VW Passat",
  plate: "ES-GS 9087",
  rating: 4.9,
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Barzahlung",
  paypal: "PayPal",
  card: "Kreditkarte",
  voucher: "Transportschein",
  app: "App-Zahlung",
  access_code: "Gutschein / Freigabe",
};

/** Quitting: Icon aus Server-Auftrag ableiten (Context kann nach Abschluss leer sein). */
type ReceiptPayIcon = "card" | "paypal" | "app" | "access_code" | "voucher" | "cash";

function receiptPaymentIconKind(req: RideRequest | null, ctxPm: PaymentMethod | null): ReceiptPayIcon {
  if (req?.authorizationSource === "access_code") return "access_code";
  const line = (req?.paymentMethod ?? "").toLowerCase();
  if (line.includes("paypal")) return "paypal";
  if (line.includes("kredit") || line.includes("karte") || line.includes("card")) return "card";
  if (line.includes("app-zahlung") || line.includes("app zahlung")) return "app";
  if (
    line.includes("krankenkasse") ||
    line.includes("transportschein") ||
    line.includes("befreit") ||
    line.includes("eigenanteil")
  ) {
    return "voucher";
  }
  if (ctxPm === "access_code") return "access_code";
  if (ctxPm === "card") return "card";
  if (ctxPm === "paypal") return "paypal";
  if (ctxPm === "app") return "app";
  if (ctxPm === "voucher") return "voucher";
  return "cash";
}

const TIP_OPTIONS = [
  { label: "1 €", amt: 1 },
  { label: "2 €", amt: 2 },
  { label: "5 €", amt: 5 },
];

function StarRating({ stars, size = 22, color = "#F59E0B" }: { stars: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= Math.round(stars) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(stars) ? color : "#D1D5DB"}
        />
      ))}
    </View>
  );
}

function ScallopRow({ backgroundColor }: { backgroundColor: string }) {
  return (
    <View style={[styles.scallopRow, { backgroundColor }]}>
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={i} style={[styles.scallopCircle, { backgroundColor }]} />
      ))}
    </View>
  );
}

const API_BASE = getApiBaseUrl();

/** Fahrer-Suche: eine volle Umdrehung, linear (Netflix-ähnlich). */
const SEARCH_SPIN_DURATION_MS = 1300;
const SEARCH_LOADER_RED = "#DC2626";
const SEARCH_RING_BORDER = 2.5;
const NO_DRIVER_WAIT_MS = 60_000;

export default function StatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { destination, origin, fareBreakdown, route, paymentMethod, completeRide, cancelRide } = useRide();
  const {
    passengerCompletedRequest: completedRequest,
    passengerAcceptedRequest: acceptedRequest,
    lastAddedRequestId,
    cancelRequest,
    refreshRequests,
    myActiveRequests,
  } = useRideRequests();
  const { driver: driverProfile } = useDriver();

  const driverName = driverProfile?.name ?? FALLBACK_DRIVER.name;
  const driverFirstName = driverName.split(" ")[0];
  const driverCar = driverProfile?.car ?? FALLBACK_DRIVER.car;
  const driverPlate = driverProfile?.plate ?? FALLBACK_DRIVER.plate;
  const driverRating = driverProfile?.rating ?? FALLBACK_DRIVER.rating;

  const [isCompleted, setIsCompleted] = useState(false);
  const [eta, setEta] = useState(8);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [customTipInput, setCustomTipInput] = useState("");
  const [userRating, setUserRating] = useState(5);
  const [now, setNow] = useState(() => Date.now());
  const [driverMarker, setDriverMarker] = useState<{ lat: number; lon: number } | null>(null);
  const [noDriverModal, setNoDriverModal] = useState(false);
  const [searchWave, setSearchWave] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const searchGlowAnim = useRef(new Animated.Value(0.4)).current;
  const prevPhaseRef = useRef<string>("searching");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const withinPickupHour = acceptedRequest?.scheduledAt
    ? (new Date(acceptedRequest.scheduledAt).getTime() - now) <= 60 * 60 * 1000
    : false;

  const rawPhase: "searching" | "accepted" | "preparing" | "arrived" | "driving" | "completed" =
    completedRequest ? "completed"
    : acceptedRequest?.status === "in_progress" || acceptedRequest?.status === "passenger_onboard" ? "driving"
    : acceptedRequest?.status === "arrived" || acceptedRequest?.status === "driver_waiting" ? "arrived"
    : acceptedRequest && acceptedRequest.scheduledAt && withinPickupHour ? "preparing"
    : acceptedRequest?.status === "accepted" || acceptedRequest?.status === "driver_arriving" ? "accepted"
    : acceptedRequest ? "accepted"
    : "searching";

  const customerPhase = isCompleted ? "completed" : rawPhase;

  const customerPhaseRef = useRef(customerPhase);
  const acceptedRequestRef = useRef<RideRequest | null>(acceptedRequest);
  customerPhaseRef.current = customerPhase;
  acceptedRequestRef.current = acceptedRequest;

  // WebSocket for real-time driver GPS + HTTP fallback
  useEffect(() => {
    if (!acceptedRequest || rawPhase === "searching" || rawPhase === "completed") return;
    const rid = acceptedRequest.id;

    connectToRide(rid, (msg) => {
      if (msg.type === "location:driver:update") {
        setDriverMarker({ lat: msg.lat as number, lon: msg.lon as number });
      }
    });

    // HTTP fallback polling every 5s
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${rid}/driver-location`);
        if (res.ok) {
          const loc = await res.json() as { lat: number; lon: number };
          setDriverMarker({ lat: loc.lat, lon: loc.lon });
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); disconnectSocket(); };
  }, [acceptedRequest?.id, rawPhase]);

  // Send customer GPS to driver every ~4s when ride is active
  useEffect(() => {
    if (!acceptedRequest || rawPhase === "searching" || rawPhase === "completed") return;
    const rid = acceptedRequest.id;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          sendCustomerLocation(latitude, longitude);
          fetch(`${API_BASE}/rides/${rid}/customer-location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: latitude, lon: longitude }),
          }).catch(() => {});
        }
      );
    })();
    return () => { sub?.remove(); };
  }, [acceptedRequest?.id, rawPhase]);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (customerPhase !== "searching") return;
    searchSpinAnim.setValue(0);
    const spin = Animated.loop(
      Animated.timing(searchSpinAnim, {
        toValue: 1,
        duration: SEARCH_SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => {
      spin.stop();
      searchSpinAnim.setValue(0);
    };
  }, [customerPhase]);

  useEffect(() => {
    if (customerPhase !== "searching") return;
    searchGlowAnim.setValue(0.92);
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(searchGlowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(searchGlowAnim, {
          toValue: 0.88,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => {
      glow.stop();
      searchGlowAnim.setValue(1);
    };
  }, [customerPhase]);

  useEffect(() => {
    if (prevPhaseRef.current !== rawPhase) {
      if (rawPhase === "accepted" || rawPhase === "preparing") setEta(8);
      else if (rawPhase === "driving") setEta(acceptedRequest?.durationMinutes ?? 20);
      prevPhaseRef.current = rawPhase;
    }
  }, [rawPhase, acceptedRequest]);

  useEffect(() => {
    const timer = setInterval(() => setEta((e) => Math.max(1, e - 1)), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (completedRequest && !isCompleted) {
      const t = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        completeRide();
        setIsCompleted(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [completedRequest]);

  const handleCancel = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setNoDriverModal(false);
    const cancelId = lastAddedRequestId ?? acceptedRequest?.id;
    if (cancelId) await cancelRequest(cancelId);
    cancelRide();
    router.replace("/");
  };

  useEffect(() => {
    if (customerPhase !== "searching") {
      setNoDriverModal(false);
      return;
    }
    setNoDriverModal(false);
    const t = setTimeout(() => {
      if (customerPhaseRef.current !== "searching") return;
      if (acceptedRequestRef.current != null) return;
      setNoDriverModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, NO_DRIVER_WAIT_MS);
    return () => clearTimeout(t);
  }, [customerPhase, searchWave]);

  const handleMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Nachricht an ${driverFirstName}`,
      "Wähle eine schnelle Nachricht:",
      [
        { text: "Ich bin gleich da 🚶", onPress: () => {} },
        { text: "Bitte kurz warten 🙏", onPress: () => {} },
        { text: "Wo sind Sie gerade? 📍", onPress: () => {} },
        { text: "Abbrechen", style: "cancel" },
      ]
    );
  };

  const handleFertig = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/");
  };

  const estimatedFare = fareBreakdown?.total ?? 0;
  const driverFinalFare = completedRequest?.finalFare ?? null;
  const totalFare = driverFinalFare ?? estimatedFare;
  const tipAmount =
    selectedTip === -1 ? (parseFloat(customTipInput.replace(",", ".")) || 0)
    : selectedTip !== null ? TIP_OPTIONS[selectedTip].amt
    : 0;
  const grandTotal = totalFare + tipAmount;

  const pendingBillingRequest = useMemo(
    () => myActiveRequests.find((r) => r.id === lastAddedRequestId) ?? null,
    [myActiveRequests, lastAddedRequestId],
  );

  const searchSpinDegrees = searchSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (isCompleted) {
    return (
      <Animated.View style={[styles.completedBg, { opacity: fadeAnim, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.completedScroll}>
          <View style={styles.thankYouSection}>
            <Text style={styles.thankYouTitle}>Vielen Dank{"\n"}für deine Fahrt!</Text>
          </View>

          <View style={styles.receiptWrapper}>
            <View style={[styles.scallopTop, { backgroundColor: "#F3F4F6" }]}>
              <ScallopRow backgroundColor="#F3F4F6" />
            </View>
            <View style={styles.receiptCard}>
              <Text style={styles.receiptTitle}>QUITTUNG</Text>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptRows}>
                {driverFinalFare ? (
                  <>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Vom Fahrer bestätigt:</Text>
                      <Text style={[styles.receiptValue, { color: "#22C55E" }]}>{formatEuro(driverFinalFare)}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: "#9CA3AF", fontSize: 11 }]}>Schätzpreis war:</Text>
                      <Text style={[styles.receiptValue, { color: "#9CA3AF", fontSize: 11 }]}>{formatEuro(estimatedFare)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Gesamtpreis:</Text>
                    <Text style={styles.receiptValue}>{formatEuro(totalFare)}</Text>
                  </View>
                )}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Distanz:</Text>
                  <Text style={styles.receiptValue}>{route?.distanceKm ?? 0} km</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Fahrtdauer:</Text>
                  <Text style={styles.receiptValue}>~{route?.durationMinutes ?? 0} Min.</Text>
                </View>
              </View>
              <View style={styles.receiptDivider} />
              <View style={styles.paymentSection}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.receiptLabel}>
                    {completedRequest
                      ? customerPayerBlockFromRideRequest(completedRequest).title
                      : "Zahlung"}
                  </Text>
                  <Text style={styles.paymentMethod}>
                    {completedRequest
                      ? customerPayerBlockFromRideRequest(completedRequest).subtitle
                      : paymentMethod
                        ? PAYMENT_LABELS[paymentMethod]
                        : "—"}
                  </Text>
                </View>
                {(() => {
                  const iconKind = receiptPaymentIconKind(completedRequest, paymentMethod);
                  if (iconKind === "card") {
                    return <Feather name="credit-card" size={24} color="#374151" />;
                  }
                  if (iconKind === "paypal") {
                    return <Text style={styles.paypalIcon}>P</Text>;
                  }
                  if (iconKind === "app") {
                    return <Feather name="smartphone" size={24} color="#374151" />;
                  }
                  if (iconKind === "access_code") {
                    return <MaterialCommunityIcons name="shield-check-outline" size={26} color="#15803D" />;
                  }
                  if (iconKind === "voucher") {
                    return <MaterialCommunityIcons name="ticket-percent-outline" size={26} color="#2563EB" />;
                  }
                  return <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#374151", lineHeight: 24 }}>€</Text>;
                })()}
              </View>
              <View style={styles.receiptDivider} />
              <Text style={[styles.receiptLabel, { marginBottom: 8 }]}>Trinkgeld für {driverFirstName}:</Text>
              <View style={styles.tipRow}>
                {TIP_OPTIONS.map((opt, i) => {
                  const isSelected = selectedTip === i;
                  return (
                    <Pressable
                      key={i}
                      style={[styles.tipBtn, isSelected && styles.tipBtnSelected]}
                      onPress={() => {
                        setSelectedTip(isSelected ? null : i);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[styles.tipBtnLabel, isSelected && styles.tipBtnLabelSelected]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.tipBtn, selectedTip === -1 && styles.tipBtnSelected]}
                  onPress={() => {
                    setSelectedTip(selectedTip === -1 ? null : -1);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.tipBtnLabel, selectedTip === -1 && styles.tipBtnLabelSelected]}>Eigener</Text>
                </Pressable>
              </View>
              {selectedTip === -1 && (
                <TextInput
                  style={styles.customTipInput}
                  placeholder="Betrag in €"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  value={customTipInput}
                  onChangeText={setCustomTipInput}
                  returnKeyType="done"
                />
              )}
              {(selectedTip !== null && tipAmount > 0) && (
                <View style={[styles.receiptRow, { marginTop: 8 }]}>
                  <Text style={[styles.receiptLabel, { fontFamily: "Inter_600SemiBold" }]}>Gesamt inkl. Trinkgeld:</Text>
                  <Text style={[styles.receiptValue, { color: "#DC2626" }]}>{formatEuro(grandTotal)}</Text>
                </View>
              )}
              <View style={styles.receiptDivider} />
              <Pressable style={styles.fertigBtn} onPress={handleFertig}>
                <Text style={styles.fertigBtnText}>Zurück zur Startseite</Text>
              </Pressable>
            </View>
            <View style={[styles.scallopBottom, { backgroundColor: "#F3F4F6" }]}>
              <ScallopRow backgroundColor="#F3F4F6" />
            </View>
          </View>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingQuestion}>Wie war deine Fahrt mit {driverFirstName}?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} onPress={() => {
                  setUserRating(i);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}>
                  <MaterialCommunityIcons
                    name={i <= userRating ? "star" : "star-outline"}
                    size={36}
                    color={i <= userRating ? "#F59E0B" : "#D1D5DB"}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.driverNameRating}>{driverName}</Text>
          </View>
        </ScrollView>
      </Animated.View>
    );
  }

  if (customerPhase === "searching") {
    return (
      <View style={styles.container}>
        {/* Karte im Hintergrund */}
        <RealMapView
          origin={origin}
          destination={destination}
          polyline={route?.polyline}
          style={styles.map}
          driverMarker={driverMarker}
        />

        {/* Such-Animation + Route-Info unten */}
        <View style={[styles.searchBottomCard, { paddingBottom: bottomPad + 16 }]}>
          <View style={styles.searchCardInnerBorder}>
            {/* Such-Animation: rotierender Ring (linear, GPU) */}
            <View style={styles.searchAnimRow}>
              <View style={styles.searchLoaderWrap}>
                <Animated.View style={{ opacity: searchGlowAnim }} pointerEvents="none">
                  <Animated.View
                    style={[
                      styles.netflixRing,
                      { transform: [{ rotate: searchSpinDegrees }] },
                    ]}
                  />
                </Animated.View>
                <View style={styles.searchLoaderIconCenter} pointerEvents="none">
                  <MaterialCommunityIcons name="taxi" size={22} color={SEARCH_LOADER_RED} />
                </View>
              </View>
              <View style={styles.searchAnimTextCol}>
                <Text style={styles.searchCardTitle}>Suche Fahrer...</Text>
                <Text style={styles.searchCardSub}>Deine Anfrage wird bearbeitet</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.searchCancelBtn, pressed && { opacity: 0.72 }]}
                onPress={() => {
                  Alert.alert(
                    "Fahrt stornieren?",
                    "Die Suche wird beendet und du kehrst zur Startseite zurück.",
                    [
                      { text: "Nein", style: "cancel" },
                      { text: "Ja, stornieren", style: "destructive", onPress: () => { void handleCancel(); } },
                    ],
                  );
                }}
                hitSlop={8}
              >
                <Text style={styles.searchCancelBtnText}>Fahrt{"\n"}stornieren</Text>
              </Pressable>
            </View>

            <View style={styles.searchCardDivider} />

            <View style={styles.searchRouteRow}>
              <View style={[styles.searchRouteDot, { backgroundColor: "#22C55E" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.searchRouteLabel}>Von</Text>
                <Text style={styles.searchRouteAddr} numberOfLines={1}>
                  {origin?.displayName ?? "Esslingen am Neckar"}
                </Text>
              </View>
            </View>
            <View style={styles.searchRouteLine} />
            <View style={styles.searchRouteRow}>
              <View style={[styles.searchRouteDot, { backgroundColor: "#DC2626" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.searchRouteLabel}>Nach</Text>
                <Text style={styles.searchRouteAddr} numberOfLines={1}>
                  {destination?.displayName ?? "–"}
                </Text>
              </View>
            </View>

            {route?.distanceKm != null && (
              <View style={styles.searchDistanceRow}>
                <Text style={styles.searchDistanceLabel}>Strecke</Text>
                <Text style={styles.searchDistanceValue}>{Number(route.distanceKm).toFixed(1)} km</Text>
              </View>
            )}

            {fareBreakdown && (
              <View style={styles.searchPriceRow}>
                <Text style={styles.searchPriceLabel}>Geschätzter Preis</Text>
                <View style={styles.searchPricePill}>
                  <Text style={styles.searchPriceValue}>{formatEuro(fareBreakdown.total)}</Text>
                </View>
              </View>
            )}

            {pendingBillingRequest ? (
              <View style={styles.searchPayerBox}>
                <Text style={styles.searchPayerTitle}>
                  {customerPayerBlockFromRideRequest(pendingBillingRequest).title}
                </Text>
                <Text style={styles.searchPayerSub}>
                  {customerPayerBlockFromRideRequest(pendingBillingRequest).subtitle}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Modal visible={noDriverModal} transparent animationType="fade" onRequestClose={() => setNoDriverModal(false)}>
          <Pressable style={styles.noDriverOverlay} onPress={() => setNoDriverModal(false)}>
            <Pressable style={styles.noDriverCard} onPress={() => {}}>
              <Text style={styles.noDriverTitle}>Kein Fahrer gefunden</Text>
              <Text style={styles.noDriverBody}>
                Innerhalb einer Minute hat sich niemand gemeldet. Du kannst die Suche erneut starten oder die Fahrt stornieren.
              </Text>
              <View style={styles.noDriverBtnRow}>
                <Pressable
                  style={[styles.noDriverBtnSecondary, { borderColor: "#D4D4D4" }]}
                  onPress={() => {
                    setNoDriverModal(false);
                    void handleCancel();
                  }}
                >
                  <Text style={styles.noDriverBtnSecondaryText}>Fahrt stornieren</Text>
                </Pressable>
                <Pressable
                  style={styles.noDriverBtnPrimary}
                  onPress={() => {
                    setNoDriverModal(false);
                    setSearchWave((w) => w + 1);
                    void refreshRequests();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Text style={styles.noDriverBtnPrimaryText}>Erneut suchen</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  const isDriving = customerPhase === "driving";
  const isPreparing = customerPhase === "preparing";
  const isAccepted = customerPhase === "accepted";
  const isArrived = customerPhase === "arrived";

  return (
    <View style={styles.container}>
      <RealMapView
        origin={origin}
        destination={destination}
        polyline={route?.polyline}
        style={styles.map}
        driverMarker={driverMarker}
      />

      {/* Zurück-Button oben links */}
      <Pressable style={[styles.backBtn, { top: topPad + 12 }]} onPress={handleCancel}>
        <Feather name="arrow-left" size={20} color="#111" />
      </Pressable>

      {/* Ziel-Label oben rechts */}
      <View style={[styles.destCard, { top: topPad + 12 }]}>
        <MaterialCommunityIcons name="map-marker" size={14} color="#DC2626" />
        <Text style={styles.destCardText} numberOfLines={1}>
          {destination?.displayName ?? "Ziel"}
        </Text>
        <Feather name="chevron-right" size={13} color="#555" />
      </View>

      {/* "Ihr Fahrer ist da!" Banner — arrived phase */}
      {isArrived && (
        <Animated.View style={[styles.arrivedBanner, { top: topPad + 68 }, { transform: [{ scale: pulseAnim }] }]}>
          <MaterialCommunityIcons name="car-emergency" size={22} color="#fff" />
          <View>
            <Text style={styles.arrivedBannerTitle}>Ihr Fahrer ist da!</Text>
            <Text style={styles.arrivedBannerSub}>Bitte zum Fahrzeug kommen</Text>
          </View>
        </Animated.View>
      )}

      {/* Uber-Stil Statusleiste unten */}
      <View style={[styles.uberBar, { paddingBottom: bottomPad + 16 }]}>
        <View style={styles.uberBarEta}>
          {isArrived ? (
            <MaterialCommunityIcons name="map-marker-check" size={32} color="#22C55E" />
          ) : (
            <>
              <Text style={styles.uberEtaNum}>{eta}</Text>
              <Text style={styles.uberEtaUnit}>MIN.</Text>
            </>
          )}
        </View>
        <View style={styles.uberBarDivider} />
        <View style={styles.uberBarInfo}>
          <Text style={styles.uberBarAddr} numberOfLines={1}>
            {isArrived ? "Fahrer wartet auf Sie" : (destination?.displayName ?? "Ziel")}
          </Text>
          <Text style={styles.uberBarStatus}>
            {isDriving
              ? `${driverFirstName} ist unterwegs · ${driverCar}`
              : isArrived
              ? `${driverFirstName} ist angekommen · ${driverPlate}`
              : isPreparing
              ? `${driverFirstName} bereitet sich vor`
              : `Fahrer gefunden · ${driverPlate}`}
          </Text>
          {acceptedRequest ? (
            <Text style={styles.uberBarPayer} numberOfLines={2}>
              {customerPayerBlockFromRideRequest(acceptedRequest).title}:{" "}
              {customerPayerBlockFromRideRequest(acceptedRequest).subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.uberMsgBtn} onPress={handleMessage}>
          <Feather name="message-circle" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  /* Uber-Stil: Zurück-Button */
  backBtn: {
    position: "absolute",
    left: rs(16),
    width: rs(42), height: rs(42), borderRadius: rs(21),
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 6,
  },

  /* Uber-Stil: Ziel-Karte oben rechts */
  destCard: {
    position: "absolute",
    right: rs(16),
    flexDirection: "row", alignItems: "center", gap: rs(5),
    backgroundColor: "#fff",
    borderRadius: rs(12),
    paddingHorizontal: rs(12), paddingVertical: rs(10),
    maxWidth: "58%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  destCardText: { fontSize: rf(13), fontFamily: "Inter_600SemiBold", color: "#111", flexShrink: 1 },

  /* Uber-Stil: Dunkle Statusleiste unten */
  uberBar: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#1C1C1E",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: rs(18),
    paddingHorizontal: rs(18),
    gap: rs(14),
  },
  uberBarEta: { alignItems: "center", minWidth: rs(48) },
  uberEtaNum: { fontSize: rf(32), fontFamily: "Inter_700Bold", color: "#fff", lineHeight: rf(36) },
  uberEtaUnit: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#9CA3AF", letterSpacing: 1 },
  uberBarDivider: { width: 1, height: rs(40), backgroundColor: "#374151" },
  uberBarInfo: { flex: 1 },
  uberBarAddr: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff", marginBottom: rs(2) },
  uberBarStatus: { fontSize: rf(12), fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  uberBarPayer: { fontSize: rf(11), fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: rs(4), lineHeight: rf(15) },
  uberMsgBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    backgroundColor: "#374151",
    alignItems: "center", justifyContent: "center",
  },

  /* Arrived banner */
  arrivedBanner: {
    position: "absolute",
    left: rs(16), right: rs(16),
    backgroundColor: "#16A34A",
    borderRadius: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 10,
  },
  arrivedBannerTitle: {
    fontSize: rf(16), fontFamily: "Inter_700Bold", color: "#fff",
  },
  arrivedBannerSub: {
    fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#BBF7D0", marginTop: 2,
  },

  logoRow: { flexDirection: "row", alignItems: "center", gap: rs(8), marginBottom: rs(10) },
  logoIconBg: {
    width: rs(32), height: rs(32), borderRadius: rs(8),
    backgroundColor: "#DC2626",
    justifyContent: "center", alignItems: "center",
  },
  logoText: { fontSize: rf(18), fontFamily: "Inter_700Bold", color: "#111", letterSpacing: -0.5 },

  /* Such-Phase: helles Panel, schwarzer Rahmen, schwarze Schrift */
  searchBottomCard: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#FFFFFF",
    paddingTop: rs(16),
    paddingHorizontal: rs(14),
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: "#1A1A1A",
  },
  searchCardInnerBorder: {
    borderWidth: 2.5,
    borderColor: "#0A0A0A",
    borderRadius: rs(18),
    paddingHorizontal: rs(16),
    paddingTop: rs(18),
    paddingBottom: rs(14),
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: rs(8),
    elevation: 6,
  },
  searchAnimRow: { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(14) },
  searchAnimTextCol: { flex: 1, minWidth: 0 },
  searchCancelBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: rs(8),
    paddingHorizontal: rs(10),
    maxWidth: rs(112),
  },
  searchCancelBtnText: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    color: "#DC2626",
    textAlign: "center",
    lineHeight: rf(18),
  },
  searchLoaderWrap: {
    width: rs(56),
    height: rs(56),
    alignItems: "center",
    justifyContent: "center",
    shadowColor: SEARCH_LOADER_RED,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: rs(10),
    elevation: 8,
  },
  netflixRing: {
    width: rs(50),
    height: rs(50),
    borderRadius: rs(25),
    borderWidth: SEARCH_RING_BORDER,
    borderColor: "transparent",
    borderTopColor: SEARCH_LOADER_RED,
    borderRightColor: SEARCH_LOADER_RED,
  },
  searchLoaderIconCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCardTitle: { fontSize: rf(17), fontFamily: "Inter_700Bold", color: "#111111", marginBottom: rs(3) },
  searchCardSub: { fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#525252" },
  searchCardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#D4D4D4", marginBottom: rs(12) },

  searchRouteRow: { flexDirection: "row", alignItems: "center", gap: rs(12), paddingVertical: rs(8) },
  searchRouteDot: { width: rs(11), height: rs(11), borderRadius: rs(6), flexShrink: 0 },
  searchRouteLine: { width: 1, height: rs(14), marginLeft: rs(4), backgroundColor: "#D4D4D4" },
  searchRouteLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium", color: "#525252", marginBottom: 2 },
  searchRouteAddr: { fontSize: rf(14), fontFamily: "Inter_500Medium", color: "#111111" },
  searchDistanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: rs(8),
    marginTop: rs(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D4D4D4",
  },
  searchDistanceLabel: { fontSize: rf(13), fontFamily: "Inter_500Medium", color: "#525252" },
  searchDistanceValue: { fontSize: rf(14), fontFamily: "Inter_600SemiBold", color: "#111111" },
  searchPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#D4D4D4",
    marginTop: rs(6),
    paddingTop: rs(12),
    paddingBottom: rs(2),
  },
  searchPriceLabel: { fontSize: rf(14), fontFamily: "Inter_500Medium", color: "#374151" },
  searchPricePill: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(8),
    borderRadius: rs(11),
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.28)",
  },
  searchPriceValue: {
    fontSize: rf(21),
    fontFamily: "Inter_700Bold",
    color: "#111111",
    letterSpacing: -0.3,
  },
  searchPayerBox: {
    marginTop: rs(12),
    padding: rs(12),
    backgroundColor: "#EFF6FF",
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  searchPayerTitle: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#1D4ED8" },
  searchPayerSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", color: "#1E40AF", marginTop: rs(4), lineHeight: rf(17) },

  noDriverOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: rs(22),
  },
  noDriverCard: {
    width: "100%",
    maxWidth: rs(360),
    backgroundColor: "#FFFFFF",
    borderRadius: rs(18),
    borderWidth: 2,
    borderColor: "#111111",
    paddingHorizontal: rs(20),
    paddingVertical: rs(22),
    gap: rs(14),
  },
  noDriverTitle: {
    fontSize: rf(19),
    fontFamily: "Inter_700Bold",
    color: "#111111",
    textAlign: "center",
  },
  noDriverBody: {
    fontSize: rf(15),
    fontFamily: "Inter_400Regular",
    color: "#404040",
    textAlign: "center",
    lineHeight: rf(22),
  },
  noDriverBtnRow: { flexDirection: "row", gap: rs(10), marginTop: rs(4) },
  noDriverBtnPrimary: {
    flex: 1,
    backgroundColor: "#DC2626",
    paddingVertical: rs(14),
    borderRadius: rs(12),
    alignItems: "center",
  },
  noDriverBtnPrimaryText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  noDriverBtnSecondary: {
    flex: 1,
    borderWidth: 1.5,
    paddingVertical: rs(14),
    borderRadius: rs(12),
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  noDriverBtnSecondaryText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#111111" },

  completedBg: { flex: 1, backgroundColor: "#F3F4F6" },
  completedScroll: { paddingHorizontal: rs(20), paddingBottom: rs(40), gap: 0 },
  thankYouSection: { paddingTop: rs(24), paddingBottom: rs(20) },
  thankYouTitle: { fontSize: rf(32), fontFamily: "Inter_700Bold", color: "#111", lineHeight: rf(40) },

  receiptWrapper: { marginHorizontal: 0 },
  scallopTop: { height: rs(18), overflow: "hidden" },
  scallopBottom: { height: rs(18), overflow: "hidden", transform: [{ rotate: "180deg" }] },
  scallopRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", height: rs(18) },
  scallopCircle: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: "#F3F4F6", marginBottom: -11 },

  receiptCard: { backgroundColor: "#fff", paddingHorizontal: rs(24), paddingVertical: rs(20), gap: rs(12) },
  receiptTitle: { fontSize: rf(20), fontFamily: "Inter_700Bold", textAlign: "center", color: "#111", letterSpacing: 2 },
  receiptDivider: { height: 1, backgroundColor: "#E5E7EB", borderStyle: "dashed", marginVertical: 2 },
  receiptRows: { gap: rs(10) },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receiptLabel: { fontSize: rf(14), fontFamily: "Inter_400Regular", color: "#374151" },
  receiptValue: { fontSize: rf(15), fontFamily: "Inter_700Bold", color: "#111" },
  paymentSection: { flexDirection: "row", alignItems: "center", gap: rs(10) },
  paymentMethod: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#111", marginTop: 2 },
  paypalIcon: { fontSize: rf(20), fontFamily: "Inter_700Bold", color: "#1565C0", width: rs(24), textAlign: "center" },

  tipRow: { flexDirection: "row", gap: rs(8) },
  tipBtn: {
    flex: 1, borderRadius: rs(12), borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingVertical: rs(10), alignItems: "center", backgroundColor: "#F9FAFB", gap: rs(2),
  },
  tipBtnSelected: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  tipBtnLabel: { fontSize: rf(14), fontFamily: "Inter_700Bold", color: "#374151" },
  tipBtnLabelSelected: { color: "#DC2626" },
  tipBtnAmount: { fontSize: rf(11), fontFamily: "Inter_400Regular", color: "#6B7280" },
  customTipInput: {
    marginTop: rs(10),
    borderWidth: 1.5,
    borderColor: "#DC2626",
    borderRadius: rs(10),
    paddingHorizontal: rs(14),
    paddingVertical: rs(10),
    fontSize: rf(16),
    fontFamily: "Inter_600SemiBold",
    color: "#1F2937",
  },

  fertigBtn: { backgroundColor: "#DC2626", borderRadius: rs(14), paddingVertical: rs(16), alignItems: "center", marginTop: rs(4) },
  fertigBtnText: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", color: "#fff" },

  ratingSection: { alignItems: "center", gap: rs(12), paddingTop: rs(24), paddingBottom: rs(16) },
  ratingQuestion: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", color: "#374151" },
  driverNameRating: { fontSize: rf(15), fontFamily: "Inter_500Medium", color: "#374151", marginTop: rs(4) },
});
