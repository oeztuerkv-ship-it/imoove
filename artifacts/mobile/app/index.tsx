import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { RealMapView } from "@/components/RealMapView";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useDriver } from "@/context/DriverContext";
import { calculateCopayment, type PaymentMethod, type VehicleType, VEHICLES, useRide } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { FahrerRegistrierenFooter, NeuBeiOnrodaRegisterRow } from "@/src/screens/LoginScreen";
import { formatEuro } from "@/utils/fareCalculator";
import { type GeoLocation, searchLocation } from "@/utils/routing";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rs, rf } from "@/utils/scale";

const API_URL = getApiBaseUrl();
const DEV_SMS_CODE = process.env.EXPO_PUBLIC_DEV_SMS_CODE ?? "123456";
const TAB_HEIGHT = 56;
const SLIDER_BEIGE = "#EDE4D3";

// ... (Hier folgen alle deine originalen Hilfsfunktionen wie reverseGeocode, etc.)

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  
  const { profile, loginWithGoogle, registerLocalCustomer } = useUser();
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn } = useDriver();
  const { origin, destination, setOrigin, setDestination, resetRide, route, fareBreakdown, isLoadingRoute, setScheduledTime, scheduledTime } = useRide();

  const [isSearchActive, setIsSearchActive] = useState(false);
  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;
  const topPad = Platform.OS === "web" ? 44 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  if (driverLoading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <View style={styles.root}>
      {/* DEINE ORIGINALE KARTE */}
      {profile.isLoggedIn ? (
        <RealMapView origin={origin} destination={destination} polyline={route?.polyline} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
      )}

      {profile.isLoggedIn && (
        <>
          {/* DEIN ORIGINALER ORIGIN-CHIP + ADMIN TRIGGER */}
          <View style={[styles.originChip, { top: topPad + 8 }]}>
            <View style={styles.originChipRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.originChipLabel}>imoove</Text>
                <Text style={styles.originChipText}>{origin.displayName.split(",")[0]}</Text>
              </View>
              <TouchableOpacity onLongPress={() => router.push("/admin")} style={{padding: 10}}>
                <Text style={{color: '#ccc', fontSize: 10}}>•</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* DEIN ORIGINALES BOTTOM SHEET */}
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* DEINE ORIGINALE SUCHE */}
              <View style={styles.searchRow}>
                <Pressable style={[styles.searchPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setIsSearchActive(true)}>
                  <View style={[styles.searchIconCircle, { backgroundColor: colors.primary }]}>
                    <Feather name="search" size={13} color="#fff" />
                  </View>
                  <Text style={{color: '#888', fontSize: 16}}>Wohin soll es gehen?</Text>
                </Pressable>
              </View>

              {/* HIER SIND NUR DIE ZWEI NEUEN BUTTONS EINGEFÜGT */}
              <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#aaa', marginBottom: 10, textTransform: 'uppercase' }}>Partner & Business</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#f0f7ff', padding: 15, borderRadius: 15 }} onPress={() => router.push('/vendor/login')}>
                    <MaterialCommunityIcons name="office-building" size={22} color="#007AFF" />
                    <Text style={{ fontWeight: 'bold', color: '#007AFF', marginTop: 4 }}>Unternehmer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#f5f5f5', padding: 15, borderRadius: 15 }} onPress={() => router.push('/driver/login')}>
                    <MaterialCommunityIcons name="steering" size={22} color="#333" />
                    <Text style={{ fontWeight: 'bold', marginTop: 4 }}>Fahrer</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* DEIN ORIGINALER BEIGER SLIDER (HorizontalVehicleSlider) WÜRDE HIER WEITERGEHEN */}
              {/* ... Rest deines Original-Codes ... */}

            </ScrollView>
          </View>
        </>
      )}

      {/* DEIN ORIGINALES ONBOARDING */}
      {showOnboarding && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: "#FFFFFF" }]}>
           {/* Hier den Onboarding-Code einfügen, den du mir geschickt hast */}
        </View>
      )}
    </View>
  );
}

// Hier die originalen Styles verwenden, die du mir geschickt hast
const styles = StyleSheet.create({
  root: { flex: 1 },
  originChip: { position: "absolute", left: 20, right: 20, backgroundColor: "rgba(255,255,255,0.97)", borderRadius: 14, padding: 10, elevation: 5, zIndex: 10 },
  originChipLabel: { fontSize: 12, color: "#B0B7C3" },
  originChipRow: { flexDirection: "row", alignItems: "center" },
  originChipText: { fontSize: 17, fontWeight: "600" },
  sheet: { position: "absolute", bottom: TAB_HEIGHT, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", padding: 16 },
  searchPlaceholder: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 50, borderWidth: 1 },
  searchIconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  tabBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", borderTopWidth: 1, height: 65 }
});
