import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { Redirect, router, useLocalSearchParams, Stack } from "expo-router";
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

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

const SEARCH_OVERLAY_BG = "#FFFFFF";
const FIXPREIS_VOUCHER_HINT = "Fixpreis ist bei Transportschein nicht verfügbar";

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; featherIcon?: string; isPaypal?: boolean; isEuro?: boolean; isVoucher?: boolean; isApp?: boolean }[] = [
  { id: "app", label: "App bezahlen", isApp: true },
  { id: "cash", label: "Bar", isEuro: true },
  { id: "paypal", label: "PayPal", isPaypal: true },
  { id: "voucher", label: "Transportschein", isVoucher: true },
];

const VEHICLE_CAR_ICON = "#171717";

const VEHICLE_ICON_CONFIG: Record<string, { icon: string; color: string; bg: string; seats: string }> = {
  standard: { icon: "car-side", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "4 Personen" },
  xl: { icon: "van-passenger", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "bis zu 6 Personen" },
  wheelchair: { icon: "wheelchair-accessibility", color: "#0369A1", bg: "#E0F2FE", seats: "Rollstuhlgerecht" },
  onroda: { icon: "car-side", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "Fixpreis-Garantie" },
};

const VEHICLE_LONG_COPY: Record<VehicleType, string[]> = {
  onroda: ["Festpreis wird vor der Buchung angezeigt.", "Ideal für Planbarkeit."],
  standard: ["Klassisches Taxi – bis zu 4 Personen.", "Schätzpreis laut Taxameter."],
  xl: ["Vans für bis zu 6 Personen.", "Mehr Platz für Gruppen."],
  wheelchair: ["Barrierefreie Beförderung.", "Rollstuhlgerechte Ausstattung."],
};

const VEHICLE_HEADLINES: Record<VehicleType, { line1: string; line2: string }> = {
  onroda: { line1: "Festpreis sicher?", line2: "Verlass dich auf uns" },
  standard: { line1: "Taxi gebucht?", line2: "Dein Standard-Wagen" },
  xl: { line1: "Mehr Platz nötig?", line2: "Bis zu 6 Personen" },
  wheelchair: { line1: "Barrierefrei unterwegs?", line2: "Wir sind für dich da" },
};

type HomeBannerSlideId = VehicleType | "krankenfahrten";
const HOME_SLIDER_ORDER: HomeBannerSlideId[] = ["onroda", "standard", "xl", "krankenfahrten", "wheelchair"];

const SLIDER_BEIGE = "#EDE4D3";
const SLIDER_BEIGE_DEEP = "#E8DCC8";
const SLIDER_CARD_GAP = 10;
const TAB_HEIGHT = 56;

async function reverseGeocode(lat: number, lon: number): Promise<GeoLocation> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    const a = data.address ?? {};
    const displayName = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}, ${a.city ?? ''}` : data.display_name?.split(",")[0] ?? "Standort";
    return { lat, lon, displayName, city: a.city ?? "" };
  } catch {
    return { lat, lon, displayName: "Aktueller Standort" };
  }
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  
  const { profile, loginWithGoogle, registerLocalCustomer } = useUser();
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn } = useDriver();
  const { 
    origin, destination, selectedVehicle, paymentMethod, isExempted,
    route, fareBreakdown, isLoadingRoute, routeError, scheduledTime,
    setOrigin, setDestination, setSelectedVehicle, setPaymentMethod, setIsExempted,
    setScheduledTime, fetchRoute, resetRide, history 
  } = useRide();
  const { myActiveRequests } = useRideRequests();

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [userGps, setUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const [savedHome, setSavedHome] = useState<GeoLocation | null>(null);
  const [savedWork, setSavedWork] = useState<GeoLocation | null>(null);
  const [editPreset, setEditPreset] = useState<"home" | "work" | null>(null);

  // Hilfs-States für Suche
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originResults, setOriginResults] = useState<GeoLocation[]>([]);
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;
  const [onboardingCustomerStep, setOnboardingCustomerStep] = useState<"social" | "register" | "verify">("social");
  const [obRegName, setObRegName] = useState("");
  const [obRegEmail, setObRegEmail] = useState("");
  const [obRegPhone, setObRegPhone] = useState("");
  const [obRegSms, setObRegSms] = useState("");

  const topPad = Platform.OS === "web" ? 44 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  useEffect(() => {
    if (isDriverLoggedIn) router.replace("/driver/dashboard");
  }, [isDriverLoggedIn]);

  const handleGpsLocate = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    const geo = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
    setOrigin(geo);
    setUserGps({ lat: loc.coords.latitude, lon: loc.coords.longitude });
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setDestQuery("");
    setOriginQuery("");
  };

  const handleBook = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push("/ride");
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* MAP ODER BACKGROUND */}
      {profile.isLoggedIn ? (
        <RealMapView
          origin={origin}
          destination={destination}
          polyline={route?.polyline}
          style={StyleSheet.absoluteFill}
          userLocation={userGps}
          edgePaddingTop={100}
          edgePaddingBottom={300}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
      )}

      {profile.isLoggedIn && (
        <>
          {/* HEADER MIT ADMIN TRIGGER */}
          <View style={[styles.originChip, { top: topPad + 8 }]}>
            <View style={styles.originChipRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.originChipLabel}>imoove</Text>
                <Text style={styles.originChipText} numberOfLines={1}>
                  {origin.displayName.split(",")[0]}
                </Text>
              </View>
              <TouchableOpacity onLongPress={() => router.push("/admin")} style={styles.adminTrigger}>
                 <Text style={{color: '#ccc', fontSize: 10}}>•</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* BOTTOM SHEET */}
          <View style={[styles.sheet, { backgroundColor: '#fff', bottom: TAB_HEIGHT }]}>
            <View style={[styles.sheetHandle, { backgroundColor: '#ddd' }]} />
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* SUCHE */}
              <View style={styles.searchRow}>
                <Pressable 
                  style={styles.searchPlaceholder}
                  onPress={() => setIsSearchActive(true)}
                >
                  <Feather name="search" size={16} color="#000" />
                  <Text style={{color: '#888', fontSize: 16}}>Wohin soll es gehen?</Text>
                </Pressable>
              </View>

              {/* QUICK ACTIONS */}
              <View style={styles.quickSection}>
                 <Text style={styles.sectionLabel}>Favoriten & Business</Text>
                 
                 {/* ZUHAUSE */}
                 <Pressable style={styles.quickRow} onPress={() => savedHome && setDestination(savedHome)}>
                    <Feather name="home" size={18} color="#666" />
                    <View style={{flex:1, marginLeft: 10}}><Text style={{fontWeight: '600'}}>Zuhause</Text></View>
                 </Pressable>

                 <View style={styles.quickDivider} />

                 {/* UNTERNEHMER PANEL */}
                 <Pressable 
                   style={[styles.quickRow, {backgroundColor: '#f0f7ff'}]} 
                   onPress={() => router.push('/vendor/login')}
                 >
                    <MaterialCommunityIcons name="office-building" size={20} color="#007AFF" />
                    <View style={{flex:1, marginLeft: 10}}>
                        <Text style={{fontWeight: '700', color: '#007AFF'}}>Unternehmer-Panel</Text>
                        <Text style={{fontSize: 11, color: '#007AFF'}}>Flotte & Management</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#007AFF" />
                 </Pressable>

                 <View style={styles.quickDivider} />

                 {/* FAHRER PANEL */}
                 <Pressable 
                    style={[styles.quickRow, {backgroundColor: '#f9f9f9'}]} 
                    onPress={() => router.push('/driver/login')}
                 >
                    <MaterialCommunityIcons name="steering" size={20} color="#333" />
                    <View style={{flex:1, marginLeft: 10}}>
                        <Text style={{fontWeight: '700', color: '#333'}}>Fahrer-Sektion</Text>
                        <Text style={{fontSize: 11, color: '#666'}}>Meine Fahrten & Status</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#333" />
                 </Pressable>
              </View>

              {/* PARTNER WERDEN FOOTER */}
              <TouchableOpacity 
                style={styles.registerFooter}
                onPress={() => router.push('/vendor/register')}
              >
                <Text style={styles.registerText}>Sie sind ein Taxiunternehmen? Jetzt Partner werden →</Text>
              </TouchableOpacity>

              <View style={{height: 40}} />
            </ScrollView>
          </View>
        </>
      )}

      {/* SEARCH OVERLAY */}
      {isSearchActive && (
        <View style={[styles.searchOverlay, { backgroundColor: '#fff', paddingTop: topPad }]}>
           <View style={styles.searchHeader}>
              <Pressable onPress={closeSearch} style={{padding: 10}}><Feather name="arrow-left" size={24} /></Pressable>
              <TextInput 
                autoFocus 
                style={styles.fieldInput} 
                placeholder="Ziel eingeben..." 
                value={destQuery}
                onChangeText={setDestQuery}
              />
           </View>
        </View>
      )}

      {/* ONBOARDING (Kopie deiner Logik) */}
      {showOnboarding && (
         <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 10000, padding: 20, justifyContent: 'center' }]}>
            <OnrodaOrMark size={80} style={{alignSelf: 'center', marginBottom: 20}} />
            <Text style={{fontSize: 32, fontWeight: 'bold', textAlign: 'center'}}>Onroda</Text>
            <Text style={{textAlign: 'center', color: '#666', marginBottom: 40}}>Mobilität ohne Grenzen</Text>
            
            <TouchableOpacity 
              style={{backgroundColor: '#000', padding: 18, borderRadius: 15, alignItems: 'center'}}
              onPress={handleGoogleSignIn}
            >
              <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16}}>Mit Google anmelden</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{marginTop: 20, padding: 15, alignItems: 'center'}}
              onPress={() => router.push('/driver/login')}
            >
              <Text style={{color: '#666'}}>Fahrer-Login</Text>
            </TouchableOpacity>
         </View>
      )}

      {/* NAVIGATION BAR */}
      <View style={[styles.tabBar, { backgroundColor: '#fff', paddingBottom: bottomPad }]}>
          <TouchableOpacity style={styles.tabItem}><Feather name="home" size={18} color={ONRODA_MARK_RED} /><Text style={styles.tabLabel}>Start</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/my-rides')}><Feather name="calendar" size={18} /><Text style={styles.tabLabel}>Fahrten</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/profile')}><Feather name="user" size={18} /><Text style={styles.tabLabel}>Profil</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  originChip: {
    position: "absolute", left: 20, right: 20,
    backgroundColor: "rgba(255,255,255,0.98)", borderRadius: 16,
    padding: 15, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, zIndex: 10,
  },
  originChipLabel: { fontSize: 10, color: "#999", fontWeight: 'bold', textTransform: 'uppercase' },
  originChipRow: { flexDirection: "row", alignItems: "center" },
  originChipText: { fontSize: 16, fontWeight: "700", color: "#111" },
  adminTrigger: { padding: 10 },
  sheet: {
    position: "absolute", left: 0, right: 0,
    borderTopLeftRadius: 25, borderTopRightRadius: 25,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15, elevation: 20,
  },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginVertical: 10 },
  searchRow: { padding: 15 },
  searchPlaceholder: {
    flexDirection: "row", alignItems: "center",
    gap: 12, padding: 18, backgroundColor: "#f5f5f5", borderRadius: 20,
  },
  quickSection: { marginHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#eee', overflow: 'hidden' },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#aaa', margin: 15, textTransform: 'uppercase' },
  quickRow: { flexDirection: "row
