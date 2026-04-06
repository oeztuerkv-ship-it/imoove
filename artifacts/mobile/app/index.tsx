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

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  
  const { profile, loginWithGoogle, registerLocalCustomer } = useUser();
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn } = useDriver();
  const { origin, destination, setOrigin, setDestination, resetRide, route, fareBreakdown, isLoadingRoute } = useRide();

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [savedHome, setSavedHome] = useState<GeoLocation | null>(null);

  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;
  const topPad = Platform.OS === "web" ? 44 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  useEffect(() => {
    if (isDriverLoggedIn) router.replace("/driver/dashboard");
  }, [isDriverLoggedIn]);

  if (driverLoading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <View style={styles.root}>
      {/* DIE ECHTE KARTE IM HINTERGRUND */}
      {profile.isLoggedIn ? (
        <RealMapView
          origin={origin}
          destination={destination}
          polyline={route?.polyline}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
      )}

      {profile.isLoggedIn && (
        <>
          {/* OBERER CHIP: NAME & ADMIN TRIGGER */}
          <View style={[styles.originChip, { top: topPad + 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.chipLabel}>Onroda</Text>
                <Text style={styles.chipText}>{origin.displayName.split(",")[0]}</Text>
              </View>
              <TouchableOpacity onLongPress={() => router.push("/admin")} style={{padding: 10}}>
                <Text style={{color: '#ccc'}}>•</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* DAS WEISSE MENÜ UNTEN */}
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView contentContainerStyle={{ padding: 15 }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 15 }}>Guten Tag!</Text>
              
              {/* SUCHE */}
              <Pressable style={styles.searchBar} onPress={() => setIsSearchActive(true)}>
                <Feather name="search" size={18} color="#888" />
                <Text style={{ color: '#888', marginLeft: 10 }}>Wohin soll es gehen?</Text>
              </Pressable>

              {/* HIER SIND DIE NEUEN BUSINESS-KACHELN */}
              <Text style={styles.sectionLabel}>Business & Partner</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity 
                  style={[styles.card, { backgroundColor: '#f0f7ff' }]} 
                  onPress={() => router.push('/vendor/login')}
                >
                  <MaterialCommunityIcons name="office-building" size={24} color="#007AFF" />
                  <Text style={{ fontWeight: 'bold', color: '#007AFF', marginTop: 5 }}>Unternehmer</Text>
                  <Text style={{ fontSize: 10, color: '#007AFF' }}>Flotte verwalten</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.card, { backgroundColor: '#f5f5f5' }]} 
                  onPress={() => router.push('/driver/login')}
                >
                  <MaterialCommunityIcons name="steering" size={24} color="#333" />
                  <Text style={{ fontWeight: 'bold', marginTop: 5 }}>Fahrer</Text>
                  <Text style={{ fontSize: 10, color: '#666' }}>Meine Touren</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => router.push('/vendor/register')} style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={{ color: ONRODA_MARK_RED, fontWeight: 'bold' }}>Partner werden →</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </>
      )}

      {/* DEIN ORIGINALES ONBOARDING / REGISTRIERUNG */}
      {showOnboarding && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 10000, padding: 20, justifyContent: 'center' }]}>
           <OnrodaOrMark size={80} style={{ alignSelf: 'center', marginBottom: 20 }} />
           <Text style={{ fontSize: 32, fontWeight: 'bold', textAlign: 'center' }}>Onroda</Text>
           <TouchableOpacity 
             style={{ backgroundColor: '#000', padding: 18, borderRadius: 15, marginTop: 30 }} 
             onPress={() => Alert.alert("Login", "Hier kommt dein Google Login")}
           >
             <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>Mit Google anmelden</Text>
           </TouchableOpacity>
        </View>
      )}

      {/* TAB BAR UNTEN */}
      {profile.isLoggedIn && (
        <View style={[styles.tabBar, { paddingBottom: bottomPad }]}>
          <TouchableOpacity style={styles.tabItem}><Feather name="home" size={20} color={ONRODA_MARK_RED} /><Text style={{fontSize: 10, color: ONRODA_MARK_RED}}>Start</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/my-rides')}><Feather name="calendar" size={20} /><Text style={{fontSize: 10}}>Fahrten</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/profile')}><Feather name="user" size={20} /><Text style={{fontSize: 10}}>Profil</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  originChip: { position: 'absolute', left: 20, right: 20, backgroundColor: '#fff', borderRadius: 15, padding: 15, elevation: 5, zIndex: 10 },
  chipLabel: { fontSize: 10, color: '#999', fontWeight: 'bold' },
  chipText: { fontSize: 16, fontWeight: '700' },
  sheet: { position: 'absolute', bottom: 65, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, shadowOpacity: 0.1, elevation: 20 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#eee', borderRadius: 3, alignSelf: 'center', marginVertical: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 15, marginBottom: 20 },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#aaa', marginBottom: 10, textTransform: 'uppercase' },
  card: { width: '48%', padding: 15, borderRadius: 15 },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', height: 65, backgroundColor: '#fff' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
