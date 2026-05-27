import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HOME_SHEET_BG, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { usePartner } from "@/context/PartnerContext";
import { loginActionButtonStyle, loginActionLabelStyle, LOGIN_ACTION_ICON_SIZE } from "@/src/screens/LoginScreen";
import { createPartnerInstantTaxiRide, resolvePartnerPickupFromGps, type PartnerPickupPlace } from "@/utils/partnerInstantBooking";

const PARTNER_GREEN = "#15803D";

export default function PartnerHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, booting, logout, handleUnauthorized } = usePartner();
  const [pickup, setPickup] = useState<PartnerPickupPlace | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const logoutInFlightRef = useRef(false);

  const refreshPickup = useCallback(async () => {
    setLoadingLocation(true);
    const result = await resolvePartnerPickupFromGps();
    if (result.ok) {
      setPickup(result.place);
    } else {
      setPickup(null);
    }
    setLoadingLocation(false);
  }, []);

  useEffect(() => {
    if (!booting && !token) {
      router.replace("/partner/login");
    }
  }, [booting, token]);

  useEffect(() => {
    void refreshPickup();
  }, [refreshPickup]);

  const handleLogout = async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    await logout();
    logoutInFlightRef.current = false;
    router.replace("/");
  };

  const handleOrderTaxi = async () => {
    if (!token || !user || !pickup || ordering) return;
    setOrdering(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createPartnerInstantTaxiRide(token, user, pickup);
    setOrdering(false);
    if (!result.ok) {
      if (result.unauthorized) {
        await handleUnauthorized();
        router.replace("/partner/login");
        return;
      }
      Alert.alert("Buchung fehlgeschlagen", result.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({ pathname: "/partner/track", params: { rideId: result.rideId } });
  };

  const companyLabel =
    user?.companyName?.trim() || user?.username?.trim() || "Ihr Unternehmen";

  if (booting) {
    return (
      <View style={[styles.centered, { backgroundColor: HOME_SHEET_BG }]}>
        <ActivityIndicator color={PARTNER_GREEN} />
        <Text style={styles.bootText}>Partner-Bereich wird geladen…</Text>
      </View>
    );
  }

  if (!user || !token) {
    return (
      <View style={[styles.centered, { backgroundColor: HOME_SHEET_BG }]}>
        <ActivityIndicator color={PARTNER_GREEN} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: HOME_SHEET_BG, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/onroda-logo-transparent.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.companyName} numberOfLines={2}>
          {companyLabel}
        </Text>
        <Pressable
          style={styles.logoutBtn}
          onPress={() => void handleLogout()}
          accessibilityLabel="Abmelden"
        >
          <Feather name="log-out" size={22} color="#EF1D26" />
        </Pressable>
      </View>

      <View style={[styles.pickupCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
        <View style={styles.pickupHeaderRow}>
          <Text style={styles.pickupLabel}>Abholadresse</Text>
          <Pressable onPress={() => void refreshPickup()} disabled={loadingLocation}>
            <Text style={styles.refreshLink}>{loadingLocation ? "…" : "Standort aktualisieren"}</Text>
          </Pressable>
        </View>
        {loadingLocation ? (
          <ActivityIndicator color={PARTNER_GREEN} style={{ marginVertical: 16 }} />
        ) : pickup ? (
          <Text style={styles.pickupValue}>{pickup.full}</Text>
        ) : (
          <Text style={styles.pickupValue}>
            Standort nicht verfügbar. Bitte GPS in den Geräteeinstellungen erlauben und „Standort
            aktualisieren“ tippen.
          </Text>
        )}
      </View>

      <View style={styles.spacer} />

      <Pressable
        style={({ pressed }) => loginActionButtonStyle({
          backgroundColor: PARTNER_GREEN,
          paddingVertical: 16,
          borderRadius: 14,
          opacity: pressed || ordering || !pickup || loadingLocation ? 0.85 : 1,
        })}
        onPress={() => void handleOrderTaxi()}
        disabled={ordering || !pickup || loadingLocation}
      >
        {ordering ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Feather name="navigation" size={LOGIN_ACTION_ICON_SIZE} color="#fff" />
            <Text style={loginActionLabelStyle({ color: "#fff" })}>Taxi bestellen</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  bootText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logo: { width: 88, height: 36 },
  companyName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
    textAlign: "right",
  },
  logoutBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    minHeight: 120,
    justifyContent: "center",
  },
  pickupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  pickupLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refreshLink: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: PARTNER_GREEN,
  },
  pickupValue: {
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    color: "#111",
    lineHeight: 24,
  },
  spacer: { flex: 1, minHeight: 24 },
});
