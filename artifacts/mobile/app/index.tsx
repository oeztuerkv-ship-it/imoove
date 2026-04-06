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
  TouchableOpacity
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
import { formatEuro } from "@/utils/fareCalculator";
import { type GeoLocation, searchLocation } from "@/utils/routing";
import { getApiBaseUrl } from "@/utils/apiBase";

const API_URL = getApiBaseUrl();
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
  const { width: screenWidth } = useWindowDimensions();
  
  const { profile, loginWithGoogle } = useUser();
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn } = useDriver();
  const { origin, destination, setOrigin, setDestination, resetRide, route } = useRide();

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [destQuery, setDestQuery] = useState("");
  const [userGps, setUserGps] = useState<{ lat: number; lon: number } | null>(null);
  const [savedHome] = useState<GeoLocation | null>(null);

  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;
  const topPad = Platform.OS === "web" ? 44 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  useEffect(() => {
    if (isDriverLoggedIn) router.replace("/driver/dashboard");
  }, [isDriverLoggedIn]);

  const handleGoogleSignIn = () => {
    Alert.alert("Info", "Google Login wird gestartet...");
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setDestQuery("");
  };

  if (driverLoading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {profile.isLoggedIn ? (
        <RealMapView
          origin={origin}
          destination={destination}
          polyline={route?.polyline}
          style={StyleSheet.absoluteFill}
          userLocation={userGps}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
      )}

      {profile.isLoggedIn && (
        <>
          <View style={[styles.originChip, { top: topPad + 8 }]}>
            <View style={styles.originChipRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.originChipLabel}>Onroda</Text>
                <Text style={styles.originChipText} numberOfLines={1}>
                  {origin.displayName.split(",")[0]}
                </Text>
              </View>
              <TouchableOpacity onLongPress={() => router.push("/admin")} style={styles.adminTrigger}>
                 <Text style={{color: '#ccc', fontSize: 10}}>•</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.sheet, { backgroundColor: '#fff', bottom: TAB_HEIGHT }]}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.searchRow}>
                <Pressable style={styles.searchPlaceholder} onPress={() => setIsSearchActive(true)}>
                  <Feather name="search" size={16} color="#000" />
                  <Text style={{color: '#888', fontSize: 16, marginLeft: 10}}>Wohin soll es gehen?</Text>
                </Pressable>
              </View>

              <View style={styles.quickSection}>
                 <Text style={styles.sectionLabel}>Favoriten & Business</Text>
                 <Pressable style={styles.quickRow} onPress={() => savedHome && setDestination(savedHome)}>
                    <Feather name="home" size={18} color="#666" />
                    <View style={{flex:1, marginLeft: 10}}><Text style={{fontWeight: '600'}}>Zuhause</Text></View>
                 </Pressable>
                 
                 <View style={styles.quickDivider} />

                 <Pressable style={[styles.quickRow, {backgroundColor: '#f0f7ff'}]} onPress={() => router.push('/vendor/login')}>
                    <MaterialCommunityIcons name="office-building" size={20} color="#007AFF" />
                    <View style={{flex:1, marginLeft: 10}}>
                        <Text style={{fontWeight: '700', color: '#007AFF'}}>Unternehmer-Panel</Text>
                        <Text style={{fontSize: 11, color: '#007AFF'}}>Flotte & Management</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#007AFF" />
                 </Pressable>

                 <View style={styles.quickDivider} />

                 <Pressable style={[styles.quickRow, {backgroundColor: '#f9f9f9'}]} onPress={() => router.push('/driver/login')}>
                    <MaterialCommunityIcons name="steering" size={20} color="#333" />
                    <View style={{flex:1, marginLeft: 10}}>
                        <Text style={{fontWeight: '700', color: '#333'}}>Fahrer-Sektion</Text>
                        <Text style={{fontSize: 11, color: '#666'}}>Meine Fahrten</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color="#333" />
                 </Pressable>
              </View>

              <TouchableOpacity style={styles.registerFooter} onPress={() => router.push('/vendor/register')}>
                <Text style={styles.registerText}>Jetzt Partner werden →</Text>
              </TouchableOpacity>
              <View style={{height: 40}} />
            </ScrollView>
          </View>
        </>
      )}

      {isSearchActive && (
        <View style={[styles.searchOverlay, { backgroundColor: '#fff', paddingTop: topPad }]}>
           <View style={styles.searchHeader}>
              <Pressable onPress={closeSearch} style={{padding: 10}}><Feather name="arrow-left" size={24} /></Pressable>
              <TextInput autoFocus style={styles.fieldInput} placeholder="Ziel eingeben..." value={destQuery} onChangeText={setDestQuery} />
           </View>
        </View>
      )}

      {showOnboarding && (
         <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 10000, padding: 20, justifyContent: 'center' }]}>
            <OnrodaOrMark size={80} style={{alignSelf: 'center', marginBottom: 20}} />
            <Text style={{fontSize: 32, fontWeight: 'bold', textAlign: 'center'}}>Onroda</Text>
            <TouchableOpacity style={{backgroundColor: '#000', padding: 18, borderRadius: 15, marginTop: 30}} onPress={handleGoogleSignIn}>
              <Text style={{color: '#fff', textAlign: 'center', fontWeight: 'bold'}}>Mit Google anmelden</Text>
            </TouchableOpacity>
         </View>
      )}

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
  originChip: { position: "absolute", left: 20, right: 20, backgroundColor: "#fff", borderRadius: 16, padding: 15, elevation: 5, zIndex: 10 },
  originChipLabel: { fontSize: 10, color: "#999", fontWeight: 'bold' },
  originChipRow: { flexDirection: "row", alignItems: "center" },
  originChipText: { fontSize: 16, fontWeight: "700" },
  adminTrigger: { padding: 10 },
  sheet: { position: "absolute", left: 0, right: 0, borderTopLeftRadius: 25, borderTopRightRadius: 25, shadowOpacity: 0.1, elevation: 20 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#eee', borderRadius: 3, alignSelf: "center", marginVertical: 10 },
  searchRow: { padding: 15 },
  searchPlaceholder: { flexDirection: "row", alignItems: "center", padding: 18, backgroundColor: "#f5f5f5", borderRadius: 20 },
  quickSection: { marginHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#eee', overflow: 'hidden' },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#aaa', margin: 15 },
  quickRow: { flexDirection: "row", alignItems: "center", padding: 18 },
  quickDivider: { height: 1, backgroundColor: '#eee' },
  registerFooter: { marginTop: 20, alignItems: 'center' },
  registerText: { color: '#007AFF', fontWeight: 'bold' },
  tabBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", borderTopWidth: 1, borderTopColor: '#eee', height: 65 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontSize: 10, marginTop: 4 },
  searchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  fieldInput: { flex: 1, fontSize: 18, padding: 15 }
});
