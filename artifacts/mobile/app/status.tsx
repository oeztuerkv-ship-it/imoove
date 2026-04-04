import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
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
};

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

export default function StatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { destination, origin, fareBreakdown, route, paymentMethod, completeRide, cancelRide } = useRide();
  const { completedRequest, acceptedRequest, lastAddedRequestId, cancelRequest } = useRideRequests();
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

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchRing1 = useRef(new Animated.Value(0)).current;
  const searchRing2 = useRef(new Animated.Value(0)).current;
  const searchRing3 = useRef(new Animated.Value(0)).current;
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
    : acceptedRequest?.status === "in_progress" ? "driving"
    : acceptedRequest?.status === "arrived" ? "arrived"
    : acceptedRequest && acceptedRequest.scheduledAt && withinPickupHour ? "preparing"
    : acceptedRequest ? "accepted"
    : "searching";

  const customerPhase = isCompleted ? "completed" : rawPhase;

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
    const makeRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 2600, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const anim = Animated.parallel([
      makeRing(searchRing1, 0),
      makeRing(searchRing2, 870),
      makeRing(searchRing3, 1740),
    ]);
    anim.start();
    return () => anim.stop();
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
    const cancelId = lastAddedRequestId ?? acceptedRequest?.id;
    if (cancelId) await cancelRequest(cancelId);
    cancelRide();
    router.replace("/");
  };

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
                  <Text style={styles.receiptLabel}>Zahlungsmethode:</Text>
                  <Text style={styles.paymentMethod}>{paymentMethod ? PAYMENT_LABELS[paymentMethod] : "—"}</Text>
                </View>
                {paymentMethod === "card" ? (
                  <Feather name="credit-card" size={24} color="#374151" />
                ) : paymentMethod === "paypal" ? (
                  <Text style={styles.paypalIcon}>P</Text>
                ) : paymentMethod === "app" ? (
                  <Feather name="smartphone" size={24} color="#374151" />
                ) : (
                  <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#374151", lineHeight: 24 }}>€</Text>
                )}
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

        {/* Stornieren-Button oben links */}
        <Pressable style={[styles.backBtn, { top: topPad + 12 }]} onPress={handleCancel}>
          <Feather name="arrow-left" size={20} color="#111" />
        </Pressable>

        {/* Such-Animation + Route-Info unten */}
        <View style={[styles.searchBottomCard, { paddingBottom: bottomPad + 16 }]}>
          {/* Such-Animation */}
          <View style={styles.searchAnimRow}>
            <View style={styles.ringContainerSmall}>
              {[searchRing1, searchRing2, searchRing3].map((ring, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.searchRingSmall,
                    {
                      opacity: ring.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 0.5, 0, 0] }),
                      transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.8] }) }],
                    },
                  ]}
                />
              ))}
              <View style={styles.ringCenterSmall}>
                <MaterialCommunityIcons name="taxi" size={20} color="#DC2626" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.searchCardTitle}>Suche Fahrer...</Text>
              <Text style={styles.searchCardSub}>Deine Anfrage wird bearbeitet</Text>
            </View>
            <ActivityIndicator color="#DC2626" size="small" />
          </View>

          {/* Trennlinie */}
          <View style={styles.searchCardDivider} />

          {/* Von / Nach */}
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

          {fareBreakdown && (
            <View style={styles.searchPriceRow}>
              <Text style={styles.searchPriceLabel}>Geschätzter Preis</Text>
              <Text style={styles.searchPriceValue}>{formatEuro(fareBreakdown.total)}</Text>
            </View>
          )}
        </View>
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

  /* Such-Phase: dunkle Karte unten (Uber-Stil) */
  searchBottomCard: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#1C1C1E",
    paddingTop: rs(20),
    paddingHorizontal: rs(18),
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
  },
  searchAnimRow: { flexDirection: "row", alignItems: "center", gap: rs(14), marginBottom: rs(14) },
  ringContainerSmall: {
    width: rs(44), height: rs(44),
    alignItems: "center", justifyContent: "center",
  },
  searchRingSmall: {
    position: "absolute",
    width: rs(44), height: rs(44),
    borderRadius: rs(22),
    borderWidth: 2, borderColor: "#DC2626",
  },
  ringCenterSmall: {
    width: rs(36), height: rs(36), borderRadius: rs(18),
    backgroundColor: "#2C1010",
    alignItems: "center", justifyContent: "center",
  },
  searchCardTitle: { fontSize: rf(15), fontFamily: "Inter_700Bold", color: "#fff", marginBottom: rs(2) },
  searchCardSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  searchCardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#374151", marginBottom: rs(12) },

  searchRouteRow: { flexDirection: "row", alignItems: "center", gap: rs(12), paddingVertical: rs(7) },
  searchRouteDot: { width: rs(10), height: rs(10), borderRadius: rs(5), flexShrink: 0 },
  searchRouteLine: { width: 1, height: rs(12), marginLeft: rs(4), backgroundColor: "#374151" },
  searchRouteLabel: { fontSize: rf(10), fontFamily: "Inter_400Regular", color: "#9CA3AF", marginBottom: 1 },
  searchRouteAddr: { fontSize: rf(13), fontFamily: "Inter_500Medium", color: "#fff" },
  searchPriceRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#374151",
    marginTop: rs(8), paddingTop: rs(12), paddingBottom: rs(4),
  },
  searchPriceLabel: { fontSize: rf(13), fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  searchPriceValue: { fontSize: rf(18), fontFamily: "Inter_700Bold", color: "#fff" },

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
