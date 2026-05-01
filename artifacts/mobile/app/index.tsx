import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Redirect, router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { BottomTabBar, BOTTOM_TAB_BAR_INNER_HEIGHT } from "@/components/BottomTabBar";
import { RealMapView } from "@/components/RealMapView";
import {
  HOME_SHEET_BG,
  HOME_SHEET_DIVIDER,
  HOME_SHEET_HANDLE,
  HOME_SHEET_INNER,
  HOME_SHEET_MUTED,
  HOME_SHEET_PANEL,
  HOME_SHEET_RIM,
  HOME_SHEET_TEXT,
} from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useDriver } from "@/context/DriverContext";
import {
  type RideHistoryEntry,
  type RideServiceClass,
  type VehicleType,
  VEHICLES,
  useRide,
} from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { FahrerRegistrierenFooter, NeuBeiOnrodaRegisterRow } from "@/src/screens/LoginScreen";
import { formatEuro } from "@/utils/fareCalculator";
import { type GeoLocation, searchLocation } from "@/utils/routing";
import { getApiBaseUrl } from "@/utils/apiBase";
import { EMAIL_VERIFICATION_PURPOSE, mapEmailVerificationApiError } from "@/utils/emailVerificationErrors";
import { getGoogleOAuthRedirectUri } from "@/utils/googleOAuthReturnUrl";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";
import { readOAuthReturnParams } from "@/utils/readOAuthReturnParams";
import { rs, rf } from "@/utils/scale";

WebBrowser.maybeCompleteAuthSession();

const API_URL = getApiBaseUrl();

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

const SEARCH_OVERLAY_BG = "#FFFFFF";

/** Krankenfahrt auf dem Start-Sheet: Grün Gesundheit/Wellbeing (statt Krankenhaus-Blau). */
const HOME_MEDICAL_GREEN = "#059669";
const HOME_MEDICAL_GREEN_DARK = "#047857";
const HOME_MEDICAL_SOFT_BG = "#ECFDF5";
/** Rot-orange CTA „Taxi jetzt bestellen“ (nicht Primär-Grün). */
const HOME_BOOKING_ORANGE = "#EA580C";
const HOME_MEDICAL_OUTLINE_BORDER = "rgba(5, 150, 105, 0.38)";

const VEHICLE_CAR_ICON = "#171717";

const VEHICLE_ICON_CONFIG: Record<string, { icon: string; color: string; bg: string; seats: string }> = {
  standard: { icon: "car-side", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "4 Personen" },
  xl: { icon: "van-passenger", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "bis zu 6 Personen" },
  wheelchair: { icon: "wheelchair-accessibility", color: "#0369A1", bg: "#E0F2FE", seats: "Rollstuhlgerecht" },
};

function ServiceBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#FDE68A" }}>
      <MaterialCommunityIcons name={icon as any} size={13} color="#92400E" />
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#92400E" }}>{label}</Text>
    </View>
  );
}

const FAVORITES_STORAGE_KEY = "@Onroda_search_favorites_v1";
/** Maximal gespeicherte Favoriten (Ziel-Suche). */
const MAX_FAVORITES_STORED = 5;
/** Auf dem Home-Sheet nur die ersten beiden der gespeicherten Reihenfolge. */
const MAX_FAVORITES_ON_HOME = 2;
/** Max. Verlauf-Einträge auf dem Home-Sheet. */
const MAX_HOME_HISTORY = 2;

interface SearchFavorite {
  id: string;
  /** Freie Bezeichnung, z. B. „Oma“ oder „Praxis“ */
  label: string;
  location: GeoLocation;
}

async function reverseGeocode(lat: number, lon: number): Promise<GeoLocation> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error();
    const data = await resp.json();
    const a = data.address ?? {};
    const road = a.road ?? "";
    const houseNumber = a.house_number ? ` ${a.house_number}` : "";
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
    const displayName = road
      ? `${road}${houseNumber}${city ? `, ${city}` : ""}`
      : data.display_name?.split(",")[0] ?? "Aktueller Standort";
    return { lat, lon, displayName, street: road, city };
  } catch {
    return { lat, lon, displayName: "Aktueller Standort" };
  }
}

const TAB_HEIGHT = BOTTOM_TAB_BAR_INNER_HEIGHT;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const bottomPad = isWeb ? 20 : insets.bottom;
  // Responsive onboarding helpers
  const isSmallScreen = screenHeight < 700;    // iPhone SE / iPhone 8
  const isMediumScreen = screenHeight < 850;   // iPhone 13/14
  const obGap = isSmallScreen ? 14 : isMediumScreen ? 18 : 24;
  const obTitleSize = isSmallScreen ? 28 : 36;
  const obBlockPad = isSmallScreen ? 14 : 20;

  const [isHomeFocused, setIsHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsHomeFocused(true);
      return () => setIsHomeFocused(false);
    }, []),
  );
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn, driver: driverProfile } = useDriver();
  const { profile, updateProfile, loginWithGoogle, registerLocalCustomer } = useUser();

  const {
    origin, destination, selectedVehicle, paymentMethod,
    route, fareBreakdown, isLoadingRoute, routeError, scheduledTime,
    selectedServiceClass,
    wheelchairHomeDraft,
    setOrigin, setDestination, setSelectedVehicle, setSelectedServiceClass, setPaymentMethod,
    setScheduledTime, fetchRoute, resetRide, history, setWheelchairHomeDraft,
  } = useRide();

  useEffect(() => {
    if (selectedVehicle !== "wheelchair") setWheelchairHomeDraft(null);
  }, [selectedVehicle, setWheelchairHomeDraft]);

  const { myActiveRequests } = useRideRequests();
  const ridesBadge = myActiveRequests.length;

  const { config: platformConfig } = useOnrodaAppConfig();
  const preBookingOn = (platformConfig.features as { preBooking?: boolean } | undefined)?.preBooking !== false;
  const sys = platformConfig.system as {
    emergencyShutdown?: boolean;
    maintenanceMode?: boolean;
    allowCustomerApp?: boolean;
    globalNoticeDe?: string;
  } | undefined;
  const customerAppBlocked = !!sys?.emergencyShutdown || !!(sys?.maintenanceMode && sys?.allowCustomerApp === false);
  const globalNoticeDe = typeof sys?.globalNoticeDe === "string" ? sys.globalNoticeDe.trim() : "";

  const blockedCustomerAlert = useCallback(() => {
    const m = platformConfig.messages?.customerAppClosedDe;
    Alert.alert("Hinweis", typeof m === "string" && m.trim() ? m : "Kunden-App derzeit nicht verfügbar.");
  }, [platformConfig.messages]);

  const goBookingCenter = useCallback(() => {
    if (customerAppBlocked) {
      blockedCustomerAlert();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/booking-center" as Href);
  }, [customerAppBlocked, blockedCustomerAlert]);

  const goReserveNewBooking = useCallback(() => {
    if (customerAppBlocked) {
      blockedCustomerAlert();
      return;
    }
    setScheduledTime(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/new-booking" as Href);
  }, [customerAppBlocked, blockedCustomerAlert, setScheduledTime]);

  const goMedicalBooking = useCallback(() => {
    if (customerAppBlocked) {
      blockedCustomerAlert();
      return;
    }
    /** Krankenfahrt nutzt keinen RideContext, nur RideRequest — Taxi-Entwurf leeren, damit nicht zwei parallele Buchungswelten wirken */
    resetRide();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/booking-medical" as Href);
  }, [customerAppBlocked, blockedCustomerAlert, resetRide]);

  /* ── Onboarding: shown whenever neither customer nor driver is logged in ── */
  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;

  type OnboardingCustomerStep = "social" | "email_enter" | "verify" | "register_details";
  const [onboardingCustomerStep, setOnboardingCustomerStep] = useState<OnboardingCustomerStep>("social");
  const [obRegName, setObRegName] = useState("");
  const [obRegEmail, setObRegEmail] = useState("");
  const [obRegPhone, setObRegPhone] = useState("");
  const [emailOtpDigits, setEmailOtpDigits] = useState("");
  /** Nach `/auth/email/verify`; optional gespeichert mit der Konto-Anlage */
  const [pendingEmailProofToken, setPendingEmailProofToken] = useState<string | undefined>(undefined);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [emailStartLoading, setEmailStartLoading] = useState(false);
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);

  useEffect(() => {
    if (cooldownSecs <= 0) return undefined;
    const id = setTimeout(() => setCooldownSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldownSecs]);

  useEffect(() => {
    if (!showOnboarding) {
      setOnboardingCustomerStep("social");
      setObRegName("");
      setObRegEmail("");
      setObRegPhone("");
      setEmailOtpDigits("");
      setPendingEmailProofToken(undefined);
      setCooldownSecs(0);
      setEmailStartLoading(false);
      setEmailVerifyLoading(false);
    }
  }, [showOnboarding]);

  /* ── After driver login, navigate to dashboard ── */
  useEffect(() => {
    if (isDriverLoggedIn) {
      router.replace(
        (driverProfile?.mustChangePassword ? "/driver/change-password" : "/driver/dashboard") as Href,
      );
    }
  }, [isDriverLoggedIn, driverProfile?.mustChangePassword]);

  /* ── Search overlay state ── */
  const [isSearchActive, setIsSearchActive] = useState(false);

  /* ── Auto-open search when navigated with ?search=1 (z. B. Sofortfahrt aus Buchungszentrale) ── */
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (searchParam === "1") {
      setIsSearchActive(true);
      requestAnimationFrame(() => {
        try {
          router.setParams({ search: undefined });
        } catch {
          /* ignore */
        }
      });
    }
  }, [searchParam]);
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);

  const [userGps, setUserGps] = useState<{ lat: number; lon: number } | null>(null);

  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<GeoLocation[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const originInputRef = useRef<TextInput>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const destInputRef = useRef<TextInput>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Nach Zeitbestätigung: Suchmaske öffnen und zuerst Abholort fokussieren. */
  const focusPickupFieldOnSearchOpenRef = useRef(false);

  /* ── Gespeicherte Such-Favoriten (lokal pro Gerät) ── */
  const [searchFavorites, setSearchFavorites] = useState<SearchFavorite[]>([]);
  const [addFavoriteOpen, setAddFavoriteOpen] = useState(false);
  const [favLabel, setFavLabel] = useState("");
  const [favStreet, setFavStreet] = useState("");
  const [favHouse, setFavHouse] = useState("");
  const [favPostal, setFavPostal] = useState("");
  const [favCity, setFavCity] = useState("");
  const [favLookupResults, setFavLookupResults] = useState<GeoLocation[]>([]);
  const [favPick, setFavPick] = useState<GeoLocation | null>(null);
  const [favLookupLoading, setFavLookupLoading] = useState(false);
  const [comboHint, setComboHint] = useState<string | null>(null);
  const comboHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapCenterKey, setMapCenterKey] = useState(0);
  /** Auf der Karte mit Ziel: Sofort vs. Termin — gleicher Einstieg wie `reserve-ride`. */
  const [bookingMode, setBookingMode] = useState<"immediate" | "scheduled">("immediate");
  const showComboHint = useCallback((msg: string) => {
    if (comboHintTimerRef.current) clearTimeout(comboHintTimerRef.current);
    setComboHint(msg);
    comboHintTimerRef.current = setTimeout(() => setComboHint(null), 4200);
  }, []);

  const persistSearchFavorites = useCallback((next: SearchFavorite[]) => {
    const capped = next.slice(0, MAX_FAVORITES_STORED);
    setSearchFavorites(capped);
    AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(capped)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_STORAGE_KEY)
      .then((r) => {
        if (!r) return;
        try {
          const parsed = JSON.parse(r) as unknown;
          if (!Array.isArray(parsed)) return;
          const ok = parsed.filter(
            (x): x is SearchFavorite =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as SearchFavorite).id === "string" &&
              typeof (x as SearchFavorite).label === "string" &&
              typeof (x as SearchFavorite).location === "object" &&
              (x as SearchFavorite).location !== null &&
              typeof (x as SearchFavorite).location.displayName === "string",
          );
          const capped = ok.slice(0, MAX_FAVORITES_STORED);
          setSearchFavorites(capped);
          if (capped.length !== ok.length) {
            AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(capped)).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const openAddFavoriteModal = useCallback(() => {
    if (searchFavorites.length >= MAX_FAVORITES_STORED) {
      Alert.alert(
        "Limit erreicht",
        `Es sind höchstens ${MAX_FAVORITES_STORED} Favoriten möglich. Bitte löschen Sie zuerst einen Eintrag.`,
      );
      return;
    }
    setFavLabel("");
    setFavStreet("");
    setFavHouse("");
    setFavPostal("");
    setFavCity("");
    setFavLookupResults([]);
    setFavPick(null);
    setAddFavoriteOpen(true);
  }, [searchFavorites.length]);

  const closeAddFavoriteModal = useCallback(() => {
    setAddFavoriteOpen(false);
  }, []);

  const runFavoriteAddressLookup = useCallback(async () => {
    const street = favStreet.trim();
    const house = favHouse.trim();
    const postal = favPostal.trim();
    const city = favCity.trim();
    if (!street || !house || !city) {
      Alert.alert("Angaben fehlen", "Bitte Straße, Hausnummer und Stadt ausfüllen (PLZ empfohlen).");
      return;
    }
    const q = `${street} ${house}, ${postal ? `${postal} ` : ""}${city}`;
    setFavLookupLoading(true);
    setFavPick(null);
    try {
      const locs = await searchLocation(q, userGps ?? undefined);
      setFavLookupResults(locs.slice(0, 8));
      if (locs.length === 0) {
        Alert.alert("Nicht gefunden", "Bitte Schreibweise prüfen oder PLZ ergänzen.");
      }
    } catch {
      setFavLookupResults([]);
      Alert.alert("Suche fehlgeschlagen", "Bitte später erneut versuchen.");
    } finally {
      setFavLookupLoading(false);
    }
  }, [favStreet, favHouse, favPostal, favCity, userGps]);

  const confirmAddFavorite = useCallback(() => {
    if (searchFavorites.length >= MAX_FAVORITES_STORED) {
      Alert.alert(
        "Limit erreicht",
        `Es sind höchstens ${MAX_FAVORITES_STORED} Favoriten möglich. Bitte löschen Sie zuerst einen Eintrag.`,
      );
      return;
    }
    if (!favPick) {
      Alert.alert("Adresse wählen", "Bitte zuerst „Adresse suchen“ und dann ein Treffer antippen.");
      return;
    }
    const label = favLabel.trim() || `${favStreet.trim()} ${favHouse.trim()}`;
    const id = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    persistSearchFavorites([...searchFavorites, { id, label, location: favPick }]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeAddFavoriteModal();
  }, [favPick, favLabel, favStreet, favHouse, searchFavorites, persistSearchFavorites, closeAddFavoriteModal]);

  const removeSearchFavorite = useCallback(
    (id: string) => {
      persistSearchFavorites(searchFavorites.filter((f) => f.id !== id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [searchFavorites, persistSearchFavorites],
  );

  const moveSearchFavorite = useCallback(
    (index: number, direction: -1 | 1) => {
      const next = [...searchFavorites];
      const j = index + direction;
      if (j < 0 || j >= next.length) return;
      const tmp = next[index];
      next[index] = next[j]!;
      next[j] = tmp!;
      persistSearchFavorites(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [searchFavorites, persistSearchFavorites],
  );

  const applyDestinationAndContinue = useCallback(
    (loc: GeoLocation) => {
      setDestination(loc);
      setDestQuery("");
      setDestResults([]);
      setIsSearchActive(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push("/ride-select" as Href);
    },
    [setDestination],
  );

  const [gpsLoading, setGpsLoading] = useState(false);
  const [googleSignInLoading, setGoogleSignInLoading] = useState(false);

  /* ── Google OAuth ── */
  const handleGoogleSignIn = useCallback(async () => {
    setGoogleSignInLoading(true);
    try {
      if (!API_URL) {
        throw new Error("API-Adresse fehlt. Bitte EXPO_PUBLIC_API_URL in .env setzen und neu starten.");
      }
      const redirectUri = getGoogleOAuthRedirectUri();
      console.log("REDIRECT:", redirectUri);
      const startUrl = `${API_URL}/auth/google/start?returnUrl=${encodeURIComponent(redirectUri)}`;
      const startRes = await fetch(startUrl);
      if (startRes.status === 404) {
        throw new Error(`Server antwortet 404 auf „${startUrl}“. Läuft die API unter dieser Adresse (inkl. /api)?`);
      }
      if (!startRes.ok) {
        const errBody = await startRes.text();
        let msg = `OAuth-Start fehlgeschlagen (${startRes.status}).`;
        try {
          const j = JSON.parse(errBody) as { error?: string };
          if (j.error) {
            msg =
              j.error === "Google Client ID not configured"
                ? "Google ist auf dem Server nicht konfiguriert (GOOGLE_CLIENT_ID / Secret)."
                : j.error;
          }
        } catch {
          if (errBody.trim()) msg = errBody.slice(0, 200);
        }
        throw new Error(msg);
      }
      const { authUrl } = (await startRes.json()) as { authUrl: string; state: string };
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== "success") return;
      if (!result.url) throw new Error("Keine Rückkehr-URL vom Browser erhalten.");
      const { error: errorParam, token: sessionToken } = readOAuthReturnParams(result.url);
      if (errorParam) throw new Error(`Google-Fehler: ${errorParam}`);
      if (sessionToken?.trim()) {
        const p = parseJwtPayloadUnsafe(sessionToken);
        if (!p?.sub) throw new Error("Ungültiges Session-Token.");
        loginWithGoogle({
          name: String(p.name ?? ""),
          email: String(p.email ?? ""),
          photoUri: typeof p.picture === "string" ? p.picture : null,
          googleId: String(p.sub),
          sessionToken,
        });
        return;
      }
      throw new Error("Kein Session-Token empfangen.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Google-Anmeldung fehlgeschlagen.";
      Alert.alert("Fehler", message);
    } finally {
      setGoogleSignInLoading(false);
    }
  }, [loginWithGoogle]);

  const submitEmailVerificationStart = useCallback(async () => {
    const email = obRegEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email)) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_email"));
      return;
    }
    if (!API_URL?.trim()) {
      Alert.alert("Hinweis", "Keine API-URL (EXPO_PUBLIC_API_URL). Bitte Umgebungsvariablen prüfen.");
      return;
    }
    setEmailStartLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || data?.ok === false) {
        const msg = mapEmailVerificationApiError(data?.error);
        Alert.alert(
          res.status === 429 ? "Bitte warten" : "Hinweis",
          typeof data?.retryAfterSeconds === "number" && data.retryAfterSeconds > 5
            ? `${msg}\n\nBitte etwa ${Math.ceil(data.retryAfterSeconds / 60)} Min. später erneut.`
            : msg,
        );
        return;
      }
      setEmailOtpDigits("");
      setPendingEmailProofToken(undefined);
      setCooldownSecs(60);
      setOnboardingCustomerStep("verify");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler — bitte Verbindung und API-Adresse prüfen.");
    } finally {
      setEmailStartLoading(false);
    }
  }, [obRegEmail]);

  const submitEmailVerificationResend = useCallback(async () => {
    const email = obRegEmail.trim().toLowerCase();
    if (!isPlausibleEmail(email) || cooldownSecs > 0 || !API_URL?.trim()) return;
    setEmailStartLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || data?.ok === false) {
        Alert.alert(
          res.status === 429 ? "Bitte warten" : "Hinweis",
          mapEmailVerificationApiError(data?.error),
        );
        return;
      }
      setCooldownSecs(60);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler — bitte erneut versuchen.");
    } finally {
      setEmailStartLoading(false);
    }
  }, [API_URL, cooldownSecs, obRegEmail]);

  const submitEmailCodeVerifyAndContinue = useCallback(async () => {
    const email = obRegEmail.trim().toLowerCase();
    const digits = emailOtpDigits.replace(/\D/g, "").slice(0, 6);
    if (!isPlausibleEmail(email) || digits.length !== 6) {
      Alert.alert("Hinweis", mapEmailVerificationApiError("invalid_params"));
      return;
    }
    setEmailVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: digits, purpose: EMAIL_VERIFICATION_PURPOSE }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        proofToken?: string;
      };
      if (!res.ok || data?.ok === false) {
        Alert.alert(
          data?.error === "too_many_attempts" ? "Gesperrt" : "Hinweis",
          mapEmailVerificationApiError(data?.error),
        );
        return;
      }
      setPendingEmailProofToken(typeof data.proofToken === "string" ? data.proofToken : undefined);
      setObRegEmail(email);
      setOnboardingCustomerStep("register_details");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Hinweis", "Netzwerkfehler — bitte Verbindung und API-Adresse prüfen.");
    } finally {
      setEmailVerifyLoading(false);
    }
  }, [emailOtpDigits, obRegEmail]);

  const completeLocalRegistrationDetails = useCallback(() => {
    const email = obRegEmail.trim().toLowerCase();
    const name = obRegName.trim();
    const phone = obRegPhone.trim();
    if (!name || !phone || !isPlausibleEmail(email)) {
      Alert.alert("Hinweis", "Bitte Namen und Telefonnummer ausfüllen (E-Mail ist bereits bestätigt).");
      return;
    }
    registerLocalCustomer(
      {
        name,
        email,
        phone,
      },
      pendingEmailProofToken?.trim()
        ? { emailVerificationProofToken: pendingEmailProofToken.trim() }
        : undefined,
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [obRegEmail, obRegName, obRegPhone, pendingEmailProofToken, registerLocalCustomer]);

  /* ── Route fetch: nach Ziel- und Fahrzeugwahl Preis live neu berechnen ── */
  useEffect(() => {
    if (destination) void fetchRoute();
  }, [destination, fetchRoute]);

  useEffect(() => {
    if (destination && !selectedVehicle) {
      setSelectedVehicle("standard");
    }
  }, [destination, selectedVehicle, setSelectedVehicle]);

  useEffect(() => {
    if (destination && selectedVehicle) {
      void fetchRoute();
    }
  }, [destination, selectedVehicle, fetchRoute]);

  useEffect(() => {
    if (!destination) setBookingMode("immediate");
  }, [destination]);

  /* ── Suchmaske: Fokus Abholort (nach Reservierungszeit) oder Ziel (Standard) ── */
  useEffect(() => {
    if (!isSearchActive) return;
    setOriginQuery(origin.displayName.split(",")[0]);
    setOriginResults([]);
    const openForRouteAfterSchedule = focusPickupFieldOnSearchOpenRef.current;
    if (openForRouteAfterSchedule) {
      focusPickupFieldOnSearchOpenRef.current = false;
      setIsEditingOrigin(true);
      if (destination) {
        const destLine = destination.displayName.split(",")[0]?.trim() || destination.displayName;
        setDestQuery(destLine);
      } else {
        setDestQuery("");
        setDestResults([]);
      }
      setTimeout(() => originInputRef.current?.focus(), 220);
    } else {
      setDestQuery("");
      setDestResults([]);
      setIsEditingOrigin(false);
      setTimeout(() => destInputRef.current?.focus(), 180);
    }
  }, [isSearchActive]);

  /* ── Switch focus when editing origin ── */
  useEffect(() => {
    if (!isSearchActive) return;
    if (isEditingOrigin) {
      setTimeout(() => originInputRef.current?.focus(), 80);
    } else {
      setTimeout(() => destInputRef.current?.focus(), 80);
    }
  }, [isEditingOrigin, isSearchActive]);

  /* ── Origin search ── */
  const handleOriginQueryChange = useCallback((text: string) => {
    setOriginQuery(text);
    if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
    if (text.length < 2) { setOriginResults([]); setIsSearchingOrigin(false); return; }
    setIsSearchingOrigin(true);
    originDebounceRef.current = setTimeout(async () => {
      try {
        const locs = await searchLocation(text, userGps ?? undefined);
        setOriginResults(locs.slice(0, 5));
      } catch { setOriginResults([]); }
      finally { setIsSearchingOrigin(false); }
    }, 300);
  }, [userGps]);

  const handleOriginSelect = (loc: GeoLocation) => {
    setOrigin(loc);
    setOriginQuery(loc.displayName.split(",")[0]);
    setOriginResults([]);
    setIsEditingOrigin(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => destInputRef.current?.focus(), 100);
  };

  /* ── Destination search ── */
  const handleDestQueryChange = useCallback((text: string) => {
    setDestQuery(text);
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    if (text.length < 2) { setDestResults([]); setIsSearchingDest(false); return; }
    setIsSearchingDest(true);
    destDebounceRef.current = setTimeout(async () => {
      try {
        const locs = await searchLocation(text, userGps ?? undefined);
        setDestResults(locs.slice(0, 6));
      } catch { setDestResults([]); }
      finally { setIsSearchingDest(false); }
    }, 300);
  }, [userGps]);

  /** Verlauf: Suche öffnen, aktuellen Abholstandort beibehalten, Ziel wie damals laden. */
  const openSearchWithHistoryEntry = useCallback(
    async (entry: RideHistoryEntry) => {
      setIsSearchActive(true);
      setIsEditingOrigin(false);
      setOriginQuery(origin.displayName);
      setOriginResults([]);
      setDestQuery(entry.destination);
      setDestResults([]);
      setIsSearchingDest(true);
      try {
        const locs = await searchLocation(entry.destination, userGps ?? undefined);
        setDestResults(locs.slice(0, 6));
      } catch {
        setDestResults([]);
      } finally {
        setIsSearchingDest(false);
      }
      setTimeout(() => destInputRef.current?.focus(), 200);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [origin.displayName, userGps],
  );

  const handleDestinationSelect = (loc: GeoLocation) => {
    applyDestinationAndContinue(loc);
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setDestQuery("");
    setDestResults([]);
    setOriginQuery("");
    setOriginResults([]);
    setIsEditingOrigin(false);
  };

  const goToDirectCheckout = useCallback(() => {
    if (!selectedVehicle) {
      Alert.alert("Fahrzeug wählen", "Bitte wählen Sie zuerst ein Fahrzeug aus.");
      return;
    }
    if (selectedVehicle === "wheelchair" && !wheelchairHomeDraft) {
      router.push("/ride-select" as Href);
      return;
    }
    if (isLoadingRoute || !fareBreakdown) {
      Alert.alert("Bitte warten", "Der Preis wird gerade berechnet.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (bookingMode === "immediate") {
      setScheduledTime(null);
    }
    router.push("/ride" as Href);
  }, [selectedVehicle, wheelchairHomeDraft, isLoadingRoute, fareBreakdown, bookingMode, setScheduledTime]);

  /* ── GPS ── */
  const handleGpsLocate = async (silent = false) => {
    setGpsLoading(true);
    if (!silent) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setGpsLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserGps({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      const geoLoc = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
      setOrigin(geoLoc);
      if (isSearchActive) setOriginQuery(geoLoc.displayName.split(",")[0]);
      if (!silent) setMapCenterKey((k) => k + 1);
      if (!silent) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    finally { setGpsLoading(false); }
  };

  useEffect(() => { handleGpsLocate(true); }, []);

  const homeHistorySlice = history.slice(0, MAX_HOME_HISTORY);
  const showOriginResults = isEditingOrigin && (originResults.length > 0 || isSearchingOrigin);
  const showDestResults = !isEditingOrigin && destResults.length > 0;
  const showFavoriteBlock = !isEditingOrigin && destResults.length === 0 && !isSearchingDest;
  const mapEdgePaddingTop = Math.round(!destination ? topPad + 8 + 70 : topPad + 12 + 46);
  const mapEdgePaddingBottom = Math.round(
    destination
      ? Math.min(380, Math.max(260, screenHeight * 0.32 + TAB_HEIGHT))
      : Math.min(460, TAB_HEIGHT + screenHeight * 0.4),
  );

  /* ── Driver guard: while AsyncStorage loads, show nothing; when logged in, redirect ── */
  if (driverLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }
  /* Nur auf dem fokussierten Home-Screen umleiten — sonst stört <Redirect> andere Routen (z. B. Modals). */
  if (isDriverLoggedIn && isHomeFocused) {
    return (
      <Redirect
        href={(driverProfile?.mustChangePassword ? "/driver/change-password" : "/driver/dashboard") as Href}
      />
    );
  }
  if (isDriverLoggedIn && !isHomeFocused) {
    return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;
  }

  return (
    <View style={styles.root}>
      {profile.isLoggedIn ? (
        <RealMapView
          origin={origin}
          destination={destination}
          polyline={route?.polyline}
          style={StyleSheet.absoluteFill}
          centerKey={mapCenterKey}
          edgePaddingTop={mapEdgePaddingTop}
          edgePaddingBottom={mapEdgePaddingBottom}
          userLocation={userGps}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]} />
      )}

      {profile.isLoggedIn ? (<>

      {!destination && (
        <View style={[styles.topRightFabs, { top: topPad + 12 }]}>
          <Pressable
            style={[styles.fab, { backgroundColor: "#fff", borderColor: colors.border }]}
            onPress={() => { void handleGpsLocate(); }}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="navigation" size={16} color={colors.primary} />
            )}
          </Pressable>
        </View>
      )}

      {/* ── TOP-RIGHT FABS ── */}
      {destination && (
        <Pressable
          style={[styles.cancelFab, { top: topPad + 12 }]}
          onPress={() => { resetRide(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="x" size={15} color="#fff" />
          <Text style={styles.cancelFabText}>Abbrechen</Text>
        </Pressable>
      )}

      {/* ── BOTTOM SHEET ── */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: HOME_SHEET_BG,
            maxHeight: destination ? "86%" : "66%",
            bottom: TAB_HEIGHT + bottomPad,
          },
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: HOME_SHEET_HANDLE }]} />

        {/* Suche / Route (ohne Rahmen-im-Rahmen, dunkel wie MiniCar) */}
        {destination ? (
          <Pressable
            style={[styles.miniRouteCard]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
          >
            <View style={styles.routeCardRowMini}>
              <View style={styles.routeCardDotOrigin} />
              <Text style={[styles.routeCardText, { color: HOME_SHEET_MUTED }]} numberOfLines={1}>
                {origin.displayName}
              </Text>
            </View>
            <View style={[styles.routeCardSepMini, { backgroundColor: HOME_SHEET_DIVIDER }]} />
            <View style={styles.routeCardRowMini}>
              <View style={[styles.routeCardDotDest, { backgroundColor: colors.primary }]} />
              <Text style={[styles.routeCardText, { color: HOME_SHEET_TEXT, fontFamily: "Inter_500Medium", flex: 1 }]} numberOfLines={1}>
                {destination.displayName}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={(e) => {
                  e.stopPropagation();
                  resetRide();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={styles.searchClearBtn}
              >
                <View style={[styles.searchClearCircle, { backgroundColor: "rgba(0,0,0,0.06)" }]}>
                  <Feather name="x" size={12} color={HOME_SHEET_TEXT} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={styles.miniSearchPill}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
            >
              <View style={[styles.searchIconCircle, { backgroundColor: colors.primary }]}>
                <Feather name="search" size={17} color="#fff" />
              </View>
              <Text style={styles.miniSearchPlaceholderText} numberOfLines={1}>
                Ziel eingeben…
              </Text>
              <Feather name="chevron-right" size={18} color={HOME_SHEET_MUTED} />
            </Pressable>
            <View style={styles.miniActionRow}>
              {preBookingOn ? (
                <>
                  <Pressable style={[styles.miniBtnPrimaryRed, styles.miniBtnHalf]} onPress={goReserveNewBooking}>
                    <Feather name="calendar" size={16} color="#fff" />
                    <Text style={styles.miniBtnPrimaryRedText} numberOfLines={1}>
                      Reservieren
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtnMedicalOutline, styles.miniBtnHalf]} onPress={goMedicalBooking}>
                    <MaterialCommunityIcons name="medical-bag" size={17} color={HOME_MEDICAL_GREEN_DARK} />
                    <Text style={styles.miniBtnMedicalOutlineText} numberOfLines={1}>
                      Krankenfahrt
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={[styles.miniBtnSecondaryDark, styles.miniBtnHalf]} onPress={goBookingCenter}>
                    <Feather name="layers" size={16} color={HOME_SHEET_TEXT} />
                    <Text style={styles.miniBtnSecondaryDarkText} numberOfLines={1}>
                      Buchungszentrale
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtnMedicalOutline, styles.miniBtnHalf]} onPress={goMedicalBooking}>
                    <MaterialCommunityIcons name="medical-bag" size={17} color={HOME_MEDICAL_GREEN_DARK} />
                    <Text style={styles.miniBtnMedicalOutlineText} numberOfLines={1}>
                      Krankenfahrt
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.sheetScroll}>
          {globalNoticeDe.length > 0 ? (
            <View
              style={{
                marginHorizontal: 20,
                marginBottom: 10,
                padding: 12,
                borderRadius: 10,
                backgroundColor: HOME_SHEET_PANEL,
                borderWidth: 1,
                borderColor: HOME_SHEET_RIM,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: rs(3) },
                shadowOpacity: 0.22,
                shadowRadius: rs(8),
                elevation: 8,
              }}
            >
              <Text style={{ color: HOME_SHEET_TEXT, fontSize: 14, lineHeight: 19 }}>{globalNoticeDe}</Text>
            </View>
          ) : null}
          {!destination ? (
            <>
              {(searchFavorites.length > 0 || homeHistorySlice.length > 0) ? (
                <View style={styles.quickSection}>
                  {searchFavorites.length > 0 ? (
                    <>
                      <Text style={[styles.homeQuickSectionHeading, { color: HOME_SHEET_MUTED }]}>
                        Favoriten
                      </Text>
                      {searchFavorites.slice(0, MAX_FAVORITES_ON_HOME).map((fav, favIdx) => (
                        <React.Fragment key={fav.id}>
                          {favIdx > 0 ? <View style={[styles.quickDivider, { backgroundColor: HOME_SHEET_DIVIDER }]} /> : null}
                          <View style={styles.quickRow}>
                            <Pressable
                              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                              onPress={() => applyDestinationAndContinue(fav.location)}
                            >
                              <View style={[styles.quickIconWrap, { backgroundColor: HOME_SHEET_INNER }]}>
                                <Feather name="map-pin" size={16} color={colors.primary} />
                              </View>
                              <View style={styles.quickTextWrap}>
                                <Text style={[styles.quickTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={1}>{fav.label}</Text>
                                <Text style={[styles.quickSub, { color: HOME_SHEET_MUTED }]} numberOfLines={1}>
                                  {fav.location.displayName}
                                </Text>
                              </View>
                            </Pressable>
                            <Pressable hitSlop={12} onPress={() => removeSearchFavorite(fav.id)}>
                              <Feather name="trash-2" size={16} color={HOME_SHEET_MUTED} />
                            </Pressable>
                          </View>
                        </React.Fragment>
                      ))}
                    </>
                  ) : null}
                  {homeHistorySlice.length > 0 ? (
                    <>
                      {searchFavorites.length > 0 ? <View style={[styles.quickDivider, { backgroundColor: HOME_SHEET_DIVIDER }]} /> : null}
                      <Text style={[styles.homeQuickSectionHeading, { color: HOME_SHEET_MUTED }]}>
                        Verlauf
                      </Text>
                      {homeHistorySlice.map((hItem, hi) => (
                        <React.Fragment key={hItem.id}>
                          {hi > 0 ? <View style={[styles.quickDivider, { backgroundColor: HOME_SHEET_DIVIDER }]} /> : null}
                          <Pressable
                            style={styles.quickRow}
                            onPress={() => void openSearchWithHistoryEntry(hItem)}
                          >
                            <View style={[styles.quickIconWrap, { backgroundColor: HOME_SHEET_INNER }]}>
                              <Ionicons name="time-outline" size={16} color={HOME_SHEET_TEXT} />
                            </View>
                            <View style={styles.quickTextWrap}>
                              <Text style={[styles.quickTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={1}>
                                {hItem.destination.split(",")[0]}
                              </Text>
                              <Text style={[styles.quickSub, { color: HOME_SHEET_MUTED }]} numberOfLines={2}>
                                {hItem.destination.split(",").slice(1, 3).join(",").trim() || hItem.origin.split(",")[0]}
                              </Text>
                            </View>
                            <Feather name="search" size={16} color={HOME_SHEET_MUTED} />
                          </Pressable>
                        </React.Fragment>
                      ))}
                    </>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.fareSection}>
              <Text style={[styles.panelLabel, { color: HOME_SHEET_MUTED }]}>BUCHUNG</Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Inter_400Regular",
                  color: HOME_SHEET_TEXT,
                  lineHeight: 21,
                  marginBottom: 12,
                }}
              >
                Ziel gesetzt. Wähle jetzt dein Fahrzeug - der Preis wird direkt angezeigt.
              </Text>
              <Text style={[styles.panelLabel, { color: HOME_SHEET_MUTED, marginTop: 4 }]}>FAHRZEUG</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookingVehicleScroll}>
                {VEHICLES.map((v) => {
                  const active = selectedVehicle === v.id;
                  const iconCfg = VEHICLE_ICON_CONFIG[v.id];
                  return (
                    <Pressable
                      key={v.id}
                      style={[
                        styles.bookingVehicleChip,
                        {
                          borderWidth: active ? 2.5 : 2,
                          borderColor: active ? colors.primary : HOME_SHEET_RIM,
                          backgroundColor: active ? colors.primary + "22" : HOME_SHEET_PANEL,
                        },
                      ]}
                      onPress={() => {
                        if (v.id === "wheelchair") {
                          setSelectedServiceClass("rollstuhl");
                          setSelectedVehicle(v.id);
                          Haptics.selectionAsync();
                          router.push("/ride-select" as Href);
                          return;
                        }
                        if (v.id === "xl") {
                          setSelectedServiceClass("xl");
                        } else {
                          setSelectedServiceClass("taxi");
                        }
                        setSelectedVehicle(v.id);
                        Haptics.selectionAsync();
                      }}
                    >
                      <View
                        style={[
                          styles.bookingVehicleIconCircle,
                          { backgroundColor: active ? colors.primary + "28" : HOME_SHEET_INNER },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={iconCfg.icon as any}
                          size={24}
                          color={iconCfg.color}
                        />
                      </View>
                      <Text style={[styles.bookingVehicleName, { color: active ? colors.primary : HOME_SHEET_TEXT }]}>
                        {v.id === "standard" ? "Standard Taxi" : v.name}
                      </Text>
                      <Text style={[styles.bookingVehicleSub, { color: HOME_SHEET_MUTED }]}>
                        {iconCfg.seats}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[
                    styles.bookingVehicleChip,
                    {
                      borderWidth: 2,
                      borderColor: HOME_MEDICAL_GREEN,
                      backgroundColor: HOME_MEDICAL_SOFT_BG,
                    },
                  ]}
                  onPress={() => {
                    resetRide();
                    Haptics.selectionAsync();
                    router.push("/booking-medical" as Href);
                  }}
                >
                  <View
                    style={[styles.bookingVehicleIconCircle, { backgroundColor: "rgba(5,150,105,0.15)" }]}
                  >
                    <MaterialCommunityIcons name="medical-bag" size={24} color={HOME_MEDICAL_GREEN_DARK} />
                  </View>
                  <Text style={[styles.bookingVehicleName, { color: HOME_MEDICAL_GREEN_DARK }]}>
                    Krankenfahrt
                  </Text>
                  <Text style={[styles.bookingVehicleSub, { color: HOME_MEDICAL_GREEN }]}>
                    Vermittlung
                  </Text>
                </Pressable>
              </ScrollView>

              {/* ── Service-Badges aus Patienten-Profil ── */}
              {(profile.rollator || profile.blindenhund || profile.sauerstoff || profile.begleitperson ||
                profile.abholungTuer || profile.begleitungAnmeldung || profile.tragehilfe || profile.dialyse) && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={[styles.panelLabel, { color: HOME_SHEET_MUTED }]}>SERVICE</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {profile.rollator && <ServiceBadge icon="walk" label="Rollator" />}
                    {profile.blindenhund && <ServiceBadge icon="dog" label="Assistenzhund" />}
                    {profile.sauerstoff && <ServiceBadge icon="air-filter" label="Sauerstoff" />}
                    {profile.begleitperson && <ServiceBadge icon="account-multiple" label="Begleitperson" />}
                    {profile.abholungTuer && <ServiceBadge icon="door-open" label={profile.abholungStockwerk ? `Tür (${profile.abholungStockwerk})` : "Abh. Tür"} />}
                    {profile.begleitungAnmeldung && <ServiceBadge icon="walk" label="Bis Anmeldung" />}
                    {profile.dialyse && <ServiceBadge icon="water" label="Dialyse" />}
                    {profile.tragehilfe && <ServiceBadge icon="human-handsup" label="Tragehilfe" />}
                  </View>
                </View>
              )}

              {/* ── Patientennotiz ── */}
              {!!profile.patientNotiz && (
                <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A", padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <Feather name="file-text" size={14} color="#92400E" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#92400E", marginBottom: 2 }}>NOTIZ FÜR DEN FAHRER</Text>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#78350F", lineHeight: 20 }}>{profile.patientNotiz}</Text>
                  </View>
                </View>
              )}

              {isLoadingRoute ? (
                <View style={[styles.loadingRow, { marginTop: 14 }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.loadingText, { color: HOME_SHEET_MUTED }]}>Route wird berechnet...</Text>
                </View>
              ) : routeError ? (
                <View style={[styles.loadingRow, { marginTop: 14 }]}>
                  <Feather name="alert-circle" size={18} color="#F87171" />
                  <Text style={[styles.loadingText, { color: "#FCA5A5" }]}>{routeError}</Text>
                </View>
              ) : route?.distanceKm != null ? (
                <View style={[styles.routeStrip, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, marginTop: 14, alignItems: "stretch" }]}>
                  <View style={[styles.routeStripItem, { justifyContent: "center" }]}>
                    <Text style={[styles.routeStripDistance, { color: HOME_SHEET_MUTED }]}>
                      {Number(route.distanceKm).toFixed(1)} km
                    </Text>
                  </View>
                  <View style={[styles.routeStripDivider, styles.routeStripDividerShort, { backgroundColor: HOME_SHEET_DIVIDER }]} />
                  <View style={[styles.routeStripItem, styles.fareHighlight, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}>
                    <Text style={[styles.routeStripLabel, { color: HOME_SHEET_MUTED, marginBottom: 2 }]}>Preis</Text>
                    <Text style={{ fontSize: 21, fontFamily: "Inter_700Bold", color: HOME_SHEET_TEXT, textAlign: "center" }}>
                      {fareBreakdown ? formatEuro(fareBreakdown.total) : "—"}
                    </Text>
                  </View>
                </View>
              ) : null}

            </View>
          )}
        </ScrollView>

        {destination && !isLoadingRoute && !routeError && route && (
          <View style={[styles.stickyBookRow, { backgroundColor: HOME_SHEET_BG, paddingBottom: 18 + bottomPad + 12 }]}>
            <View style={styles.stickyBookCol}>
              <Pressable
                style={[
                  styles.bookBtn,
                  {
                    backgroundColor: HOME_BOOKING_ORANGE,
                    borderWidth: 0,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                    elevation: 4,
                  },
                ]}
                onPress={goToDirectCheckout}
              >
                <Text style={[styles.bookBtnText, { color: "#fff" }]}>Taxi jetzt bestellen</Text>
              </Pressable>
              <Text style={[styles.bookBtnHint, { color: HOME_SHEET_MUTED }]}>
                Fahrzeug und Preis sind festgelegt. Im nächsten Schritt bestätigen Sie die Bestellung.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── BOTTOM TAB BAR ── */}
      <BottomTabBar active="start" />

      {/* ══════════════════════════════════════════════════
          ── VOLLBILD-SUCH-OVERLAY ──
          Erscheint über allem, Vorschläge über Tastatur
      ══════════════════════════════════════════════════ */}
      {isSearchActive && (
        <View style={[styles.searchOverlay, { backgroundColor: SEARCH_OVERLAY_BG }]}>
          {/* Suche-Header (fester Bereich oben) */}
          <View style={[styles.searchHeader, { paddingTop: topPad + 8, backgroundColor: SEARCH_OVERLAY_BG, borderBottomColor: "#E5E7EB" }]}>
            {/* Zeile: Zurück + (optional Banner) + Abbrechen */}
            <View style={styles.searchHeaderRow}>
              <Pressable style={styles.backBtn} onPress={closeSearch}>
                <Feather name="arrow-left" size={22} color={colors.foreground} />
              </Pressable>

              <View style={{ flex: 1 }} />

              <Pressable style={styles.cancelBtn} onPress={closeSearch}>
                <Text style={[styles.cancelBtnText, { color: colors.primary }]}>Abbrechen</Text>
              </Pressable>
            </View>

            {scheduledTime && (
              <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#B45309" }} numberOfLines={1}>
                  Vorbestellung · {scheduledTime.getHours().toString().padStart(2, "0")}:{scheduledTime.getMinutes().toString().padStart(2, "0")} Uhr
                </Text>
              </View>
            )}

            {/* Start → Ziel Card */}

            <View style={[styles.twoFieldCard, { backgroundColor: SEARCH_OVERLAY_BG, borderColor: "#E5E7EB" }]}>
              {/* Punkte + Linie links */}
              <View style={styles.dotsCol}>
                <View style={[styles.dotOrigin, isEditingOrigin && { borderColor: colors.primary }]} />
                <View style={[styles.dotLine, { backgroundColor: colors.border }]} />
                <View style={[styles.dotDestination, { backgroundColor: isEditingOrigin ? colors.border : colors.primary }]} />
              </View>

              {/* Felder rechts */}
              <View style={styles.fieldsCol}>
                {/* START-Feld */}
                <Pressable
                  style={[styles.fieldWrap, isEditingOrigin && { borderBottomColor: colors.primary }]}
                  onPress={() => { setIsEditingOrigin(true); }}
                >
                  <TextInput
                    ref={originInputRef}
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={originQuery}
                    onChangeText={handleOriginQueryChange}
                    placeholder="Startadresse eingeben..."
                    placeholderTextColor={colors.mutedForeground}
                    onFocus={() => setIsEditingOrigin(true)}
                    returnKeyType="next"
                    autoCorrect={false}
                  />
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Pressable
                      onPress={() => handleGpsLocate()}
                      hitSlop={8}
                      style={styles.gpsIconBtn}
                    >
                      <Feather name="navigation" size={15} color={colors.primary} />
                    </Pressable>
                  )}
                </Pressable>

                <View style={[styles.fieldSeparator, { backgroundColor: colors.border }]} />

                {/* ZIEL-Feld */}
                <View style={[styles.fieldWrap, !isEditingOrigin && { borderBottomColor: colors.primary }]}>
                  <TextInput
                    ref={destInputRef}
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={destQuery}
                    onChangeText={handleDestQueryChange}
                    placeholder="Ziel eingeben..."
                    placeholderTextColor={colors.mutedForeground}
                    onFocus={() => setIsEditingOrigin(false)}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {isSearchingDest && <ActivityIndicator size="small" color={colors.primary} />}
                  {destQuery.length > 0 && !isSearchingDest && (
                    <Pressable onPress={() => { setDestQuery(""); setDestResults([]); }} hitSlop={8}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Ergebnisliste — bleibt ÜBER der Tastatur dank KeyboardAvoidingView */}
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: SEARCH_OVERLAY_BG }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1, backgroundColor: SEARCH_OVERLAY_BG }}
              contentContainerStyle={[styles.resultsContent, { backgroundColor: SEARCH_OVERLAY_BG }]}
            >
              {/* Origin-Suchergebnisse */}
              {showOriginResults && (
                <View style={[styles.resultGroup, { borderColor: colors.border }]}>
                  {isSearchingOrigin && originResults.length === 0 ? (
                    <View style={styles.searchingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>Suche läuft...</Text>
                    </View>
                  ) : (
                    originResults.map((loc, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />}
                        <Pressable style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]} onPress={() => handleOriginSelect(loc)}>
                          <View style={[styles.resultIcon, { backgroundColor: "#F0F9FF" }]}>
                            <Feather name="map-pin" size={15} color="#3B82F6" />
                          </View>
                          <View style={styles.resultText}>
                            <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                              {loc.displayName.split(",")[0]}
                            </Text>
                            <Text style={[styles.resultSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {loc.displayName.split(",").slice(1, 3).join(",").trim()}
                            </Text>
                          </View>
                        </Pressable>
                      </React.Fragment>
                    ))
                  )}
                </View>
              )}

              {/* Dest-Suchergebnisse (live) */}
              {showDestResults && (
                <View style={[styles.resultGroup, { borderColor: colors.border }]}>
                  {destResults.map((loc, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />}
                      <Pressable style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]} onPress={() => handleDestinationSelect(loc)}>
                        <View style={[styles.resultIcon, { backgroundColor: colors.muted }]}>
                          <Feather name="map-pin" size={15} color={colors.primary} />
                        </View>
                        <View style={styles.resultText}>
                          <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {loc.displayName.split(",")[0]}
                          </Text>
                          <Text style={[styles.resultSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {loc.displayName.split(",").slice(1, 3).join(",").trim()}
                          </Text>
                        </View>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* Persönliche Favoriten */}
              {showFavoriteBlock && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 6 }}>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                      MEINE ZIELE
                    </Text>
                    {searchFavorites.length < MAX_FAVORITES_STORED ? (
                      <Pressable onPress={() => openAddFavoriteModal()} hitSlop={8}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>+ Neu</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {searchFavorites.length > 0 ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                        paddingHorizontal: 4,
                        marginBottom: 8,
                        lineHeight: 15,
                      }}
                    >
                      Oberste {MAX_FAVORITES_ON_HOME} erscheinen auf der Startseite. Mit ↑↓ die Reihenfolge ändern.
                    </Text>
                  ) : null}
                  <View style={[styles.resultGroup, { borderColor: colors.border }]}>
                    {searchFavorites.length === 0 ? (
                      <Pressable
                        style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]}
                        onPress={() => openAddFavoriteModal()}
                      >
                        <View style={[styles.resultIcon, { backgroundColor: "#F0F9FF" }]}>
                          <Feather name="bookmark" size={15} color={colors.primary} />
                        </View>
                        <View style={styles.resultText}>
                          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Ersten Favoriten anlegen</Text>
                          <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
                            Straße, Hausnummer, PLZ und Stadt — dann Kartentreffer auswählen
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    ) : (
                      searchFavorites.map((fav, i) => (
                        <React.Fragment key={fav.id}>
                          {i > 0 && <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />}
                          <View style={styles.resultRow}>
                            <Pressable
                              style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }, pressed && { backgroundColor: colors.muted, borderRadius: 10 }]}
                              onPress={() => handleDestinationSelect(fav.location)}
                            >
                              <View style={[styles.resultIcon, { backgroundColor: colors.muted }]}>
                                <Feather name="map-pin" size={15} color={colors.primary} />
                              </View>
                              <View style={styles.resultText}>
                                <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
                                  {fav.label}
                                </Text>
                                <Text style={[styles.resultSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                                  {fav.location.displayName}
                                </Text>
                              </View>
                            </Pressable>
                            <View style={styles.favReorderCol}>
                              <Pressable
                                hitSlop={8}
                                disabled={i === 0}
                                onPress={() => moveSearchFavorite(i, -1)}
                                style={{ opacity: i === 0 ? 0.35 : 1 }}
                              >
                                <Feather name="chevron-up" size={20} color={colors.mutedForeground} />
                              </Pressable>
                              <Pressable
                                hitSlop={8}
                                disabled={i >= searchFavorites.length - 1}
                                onPress={() => moveSearchFavorite(i, 1)}
                                style={{ opacity: i >= searchFavorites.length - 1 ? 0.35 : 1 }}
                              >
                                <Feather name="chevron-down" size={20} color={colors.mutedForeground} />
                              </Pressable>
                            </View>
                            <Pressable hitSlop={10} onPress={() => removeSearchFavorite(fav.id)} style={{ padding: 6 }}>
                              <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                            </Pressable>
                          </View>
                        </React.Fragment>
                      ))
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}

      </>) : (
        /* ── WELCOME OVERLAY (not logged in) ── */
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          {/* Bottom dark gradient */}
          <View style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "65%",
            backgroundColor: "rgba(10,10,10,0.72)",
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
          }} />

          {/* Branding */}
          <View style={{
            position: "absolute", bottom: 160 + bottomPad, left: 0, right: 0,
            alignItems: "center", gap: 10,
          }}>
            <OnrodaOrMark size={76} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 38, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -1.5 }}>Onroda</Text>
            <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.70)", textAlign: "center", paddingHorizontal: 40 }}>
              Mobilität ohne Grenzen
            </Text>
          </View>
        </View>
      )}

      {/* ── OBLIGATORISCHES ONBOARDING OVERLAY ── */}
      {showOnboarding && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: "#FFFFFF" }]}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingTop: topPad + 16,
              paddingBottom: bottomPad + 16,
              gap: obGap,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo + Branding */}
            <View style={[styles.onboardingBranding, { gap: isSmallScreen ? 4 : 6, marginBottom: isSmallScreen ? 4 : 8 }]}>
              <OnrodaOrMark
                size={isSmallScreen ? 64 : 80}
                style={{ marginBottom: isSmallScreen ? 4 : 8 }}
              />
              <Text style={[styles.onboardingTitle, { color: colors.foreground, fontSize: obTitleSize }]}>
                Onroda
              </Text>
              <View
                style={{
                  height: 3,
                  width: 44,
                  borderRadius: 2,
                  backgroundColor: ONRODA_MARK_RED,
                  alignSelf: "center",
                  marginTop: 2,
                  marginBottom: 2,
                }}
              />
              <Text style={[styles.onboardingTagline, { color: colors.mutedForeground, fontSize: isSmallScreen ? 13 : 15 }]}>
                Mobilität ohne Grenzen
              </Text>
            </View>

            {/* ── KUNDEN-BLOCK (+ separate Fahrer-Karte wie Profil) ── */}
            {onboardingCustomerStep === "social" ? (
              <>
                <View style={[styles.onboardingBlock, { backgroundColor: colors.muted, borderColor: colors.border, padding: obBlockPad, gap: isSmallScreen ? 10 : 14 }]}>
                  <NeuBeiOnrodaRegisterRow
                    mutedColor={colors.mutedForeground}
                    marginBottom={isSmallScreen ? 6 : 10}
                    fontSize={isSmallScreen ? 13 : 14}
                    onRegisterPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setObRegName("");
                      setObRegEmail("");
                      setObRegPhone("");
                      setEmailOtpDigits("");
                      setPendingEmailProofToken(undefined);
                      setCooldownSecs(0);
                      setOnboardingCustomerStep("email_enter");
                    }}
                  />
                  <View style={{ gap: isSmallScreen ? 8 : 10 }}>
                    <Pressable
                      style={[styles.socialBtn, {
                        backgroundColor: "#FFFFFF",
                        borderColor: colors.border,
                        paddingVertical: isSmallScreen ? 13 : 16,
                        opacity: googleSignInLoading ? 0.75 : 1,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                        elevation: 1,
                      }]}
                      onPress={handleGoogleSignIn}
                      disabled={googleSignInLoading}
                    >
                      {googleSignInLoading
                        ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ width: 22, height: 22 }} />
                        : <Image source={require("../assets/images/google-icon.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />}
                      <Text style={[styles.socialBtnText, { color: colors.foreground, fontSize: isSmallScreen ? 15 : 16, fontFamily: "Inter_600SemiBold" }]}>
                        {googleSignInLoading ? "Anmeldung läuft…" : "Weiter mit Google"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.socialBtn, {
                        backgroundColor: "#FFFFFF",
                        borderColor: colors.border,
                        paddingVertical: isSmallScreen ? 13 : 16,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                        elevation: 1,
                      }]}
                      onPress={() => Alert.alert("Apple-Login", "Apple-Anmeldung ist noch nicht verfügbar.")}
                    >
                      <MaterialCommunityIcons name="apple" size={22} color={colors.foreground} />
                      <Text style={[styles.socialBtnText, { color: colors.foreground, fontSize: isSmallScreen ? 15 : 16, fontFamily: "Inter_600SemiBold" }]}>
                        Weiter mit Apple
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginVertical: isSmallScreen ? 2 : 6,
                    paddingHorizontal: 8,
                  }}
                >
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <Text
                    style={{
                      marginHorizontal: 14,
                      fontSize: isSmallScreen ? 12 : 13,
                      fontFamily: "Inter_500Medium",
                      color: colors.mutedForeground,
                    }}
                  >
                    oder
                  </Text>
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                </View>

                <View style={[styles.onboardingBlock, { backgroundColor: colors.muted, borderColor: colors.border, padding: obBlockPad }]}>
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      paddingVertical: isSmallScreen ? 14 : 16,
                      borderRadius: 14,
                      backgroundColor: "#111111",
                      opacity: pressed ? 0.88 : 1,
                    })}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push("/driver/login" as Href);
                    }}
                  >
                    <Feather name="log-in" size={22} color="#FFFFFF" />
                    <Text style={{ fontSize: isSmallScreen ? 15 : 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" }}>
                      Fahrer-Login
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
            <View style={[styles.onboardingBlock, { backgroundColor: colors.muted, borderColor: colors.border, padding: obBlockPad, gap: isSmallScreen ? 10 : 14 }]}>
              {onboardingCustomerStep === "email_enter" ? (
                <>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                    onPress={() => setOnboardingCustomerStep("social")}
                  >
                    <Feather name="arrow-left" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>E-Mail-Adresse</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -6 }}>
                    Wir schicken einen 6-stelligen Bestätigungscode — Code ist etwa 10 Minuten gültig.
                  </Text>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="mail" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground }]}
                      placeholder="E-Mail-Adresse eingeben"
                      placeholderTextColor={colors.mutedForeground}
                      value={obRegEmail}
                      onChangeText={setObRegEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      editable={!emailStartLoading}
                    />
                  </View>
                  <Pressable
                    style={[styles.socialBtn, {
                      backgroundColor: "#111111",
                      borderColor: "#111111",
                      paddingVertical: isSmallScreen ? 13 : 16,
                      opacity: emailStartLoading ? 0.72 : 1,
                    }]}
                    onPress={() => void submitEmailVerificationStart()}
                    disabled={emailStartLoading}
                  >
                    {emailStartLoading
                      ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                      <Feather name="send" size={20} color="#fff" />
                      )}
                    <Text style={[styles.socialBtnText, { color: "#fff", fontSize: isSmallScreen ? 15 : 16 }]}>
                      Bestätigungscode senden
                    </Text>
                  </Pressable>
                </>
              ) : onboardingCustomerStep === "verify" ? (
                <>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                    onPress={() => setOnboardingCustomerStep("email_enter")}
                  >
                    <Feather name="arrow-left" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Bestätigungscode</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -6 }}>
                    Code eingeben, den wir gerade an <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{obRegEmail.trim() || "deine E-Mail"}</Text> gesendet haben.
                  </Text>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="hash" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground, letterSpacing: 4 }]}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.mutedForeground}
                      value={emailOtpDigits}
                      onChangeText={(t) => setEmailOtpDigits(t.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      editable={!emailVerifyLoading}
                    />
                  </View>
                  <Pressable
                    style={[styles.socialBtn, {
                      backgroundColor: emailOtpDigits.trim().length === 6 ? "#111111" : colors.muted,
                      borderColor: emailOtpDigits.trim().length === 6 ? "#111111" : colors.border,
                      paddingVertical: isSmallScreen ? 13 : 16,
                      opacity: emailVerifyLoading ? 0.75 : 1,
                    }]}
                    onPress={() => void submitEmailCodeVerifyAndContinue()}
                    disabled={emailOtpDigits.trim().length !== 6 || emailVerifyLoading}
                  >
                    {emailVerifyLoading ? (
                      <ActivityIndicator size="small" color={emailOtpDigits.trim().length === 6 ? "#fff" : colors.mutedForeground} />
                    ) : (
                      <Feather name="check" size={20} color={emailOtpDigits.trim().length === 6 ? "#fff" : colors.mutedForeground} />
                    )}
                    <Text style={[styles.socialBtnText, {
                      color: emailOtpDigits.trim().length === 6 ? "#fff" : colors.mutedForeground,
                      fontSize: isSmallScreen ? 15 : 16,
                    }]}
                    >
                      Code prüfen & weiter
                    </Text>
                  </Pressable>
                  <Pressable
                    style={{ alignSelf: "center", paddingVertical: 10 }}
                    onPress={() => void submitEmailVerificationResend()}
                    disabled={cooldownSecs > 0 || emailStartLoading}
                  >
                    <Text style={{
                      fontSize: 14,
                      fontFamily: "Inter_500Medium",
                      color: cooldownSecs > 0 ? colors.mutedForeground : colors.primary,
                    }}
                    >
                      {cooldownSecs > 0 ? `Erneut senden in ${cooldownSecs}s` : "Code erneut senden"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                    onPress={() => setOnboardingCustomerStep("verify")}
                  >
                    <Feather name="arrow-left" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Profil</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -6 }}>
                    E-Mail ist bestätigt. Bitte Namen und Telefon für die Buchung angeben.
                  </Text>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="user" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground }]}
                      placeholder="Vor- und Nachname"
                      placeholderTextColor={colors.mutedForeground}
                      value={obRegName}
                      onChangeText={setObRegName}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="phone" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground }]}
                      placeholder="Telefonnummer"
                      placeholderTextColor={colors.mutedForeground}
                      value={obRegPhone}
                      onChangeText={setObRegPhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />
                  </View>
                  <Pressable
                    style={[styles.socialBtn, {
                      backgroundColor: "#111111",
                      borderColor: "#111111",
                      paddingVertical: isSmallScreen ? 13 : 16,
                    }]}
                    onPress={completeLocalRegistrationDetails}
                  >
                    <Feather name="check" size={20} color="#fff" />
                    <Text style={[styles.socialBtnText, { color: "#fff", fontSize: isSmallScreen ? 15 : 16 }]}>
                      Registrierung abschließen
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
            )}

            {onboardingCustomerStep === "social" ? null : (
              <>
                <FahrerRegistrierenFooter
                  colors={{
                    foreground: colors.foreground,
                    mutedForeground: colors.mutedForeground,
                    muted: colors.muted,
                    border: colors.border,
                  }}
                  padding={isSmallScreen ? 12 : 14}
                  onAnmeldenPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/driver/login" as Href);
                  }}
                />
              </>
            )}

          </ScrollView>
        </View>
      )}

      {/* ── Favorit hinzufügen (Straße/Nr./PLZ/Stadt → Geocoding) ── */}
      <Modal visible={addFavoriteOpen} transparent animationType="fade" onRequestClose={closeAddFavoriteModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={closeAddFavoriteModal}>
            <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={styles.modalTitleRow}>
                <Feather name="bookmark" size={18} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.foreground, marginLeft: 8 }]} numberOfLines={1}>
                  Favorit hinzufügen
                </Text>
                <Pressable onPress={closeAddFavoriteModal} style={[styles.modalCloseBtn, { marginLeft: "auto" }]}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 10 }}>
                Bezeichnung optional. Pflicht Straße, Hausnummer und Stadt (PLZ verbessert die Treffer).
              </Text>

              <TextInput
                placeholder="Bezeichnung (z. B. Zuhause, Praxis)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.favFormInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                value={favLabel}
                onChangeText={setFavLabel}
                autoCorrect={false}
              />
              <TextInput
                placeholder="Straße"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.favFormInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                value={favStreet}
                onChangeText={setFavStreet}
                autoCorrect={false}
              />
              <View style={styles.favFormRow}>
                <TextInput
                  placeholder="Nr."
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.favFormInputHalf, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  value={favHouse}
                  onChangeText={setFavHouse}
                  autoCorrect={false}
                />
                <TextInput
                  placeholder="PLZ"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.favFormInputHalf, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                  value={favPostal}
                  onChangeText={setFavPostal}
                  keyboardType="number-pad"
                />
              </View>
              <TextInput
                placeholder="Stadt"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.favFormInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                value={favCity}
                onChangeText={setFavCity}
                autoCorrect={false}
              />

              <Pressable
                style={[styles.modalBtnSecondary, { borderColor: colors.border, marginTop: 6 }]}
                onPress={() => runFavoriteAddressLookup()}
                disabled={favLookupLoading}
              >
                {favLookupLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="search" size={16} color={colors.primary} />
                )}
                <Text style={[styles.modalBtnSecondaryText, { color: colors.primary }]}>
                  {favLookupLoading ? "Suche läuft…" : "Adresse suchen"}
                </Text>
              </Pressable>

              {favLookupResults.length > 0 && (
                <ScrollView
                  style={{ maxHeight: 220, marginTop: 10 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 6 }}>
                    MAPPTREFFER ANTIPPEN
                  </Text>
                  {favLookupResults.map((loc, idx) => {
                    const picked = favPick?.displayName === loc.displayName && favPick.lat === loc.lat && favPick.lon === loc.lon;
                    return (
                      <Pressable
                        key={`${loc.displayName}-${idx}`}
                        style={[
                          styles.editPresetResult,
                          { borderColor: colors.border },
                          picked && { backgroundColor: "#FEF2F2" },
                        ]}
                        onPress={() => setFavPick(loc)}
                      >
                        <Feather name="map-pin" size={14} color={picked ? colors.primary : colors.mutedForeground} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: picked ? colors.primary : colors.foreground }} numberOfLines={2}>
                            {loc.displayName}
                          </Text>
                        </View>
                        {picked && <Feather name="check" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Pressable
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: favPick ? colors.success : colors.muted, marginTop: 14 },
                ]}
                disabled={!favPick}
                onPress={() => confirmAddFavorite()}
              >
                <Feather name="check" size={16} color={favPick ? "#fff" : colors.mutedForeground} />
                <Text style={[styles.modalBtnPrimaryText, { color: favPick ? "#fff" : colors.mutedForeground }]}>
                  Speichern
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* ── Map overlays ── */
  originChip: {
    position: "absolute", left: rs(20), right: rs(20),
    backgroundColor: "rgba(255,255,255,0.97)", borderRadius: rs(14),
    paddingHorizontal: rs(14), paddingVertical: rs(7),
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 5, zIndex: 10,
  },
  originChipLabel: { fontSize: rf(12), fontFamily: "Inter_400Regular", color: "#B0B7C3", marginBottom: rs(2), letterSpacing: 0.6, textTransform: "uppercase" },
  originChipRow: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  originChipText: { flex: 1, fontSize: rf(17), fontFamily: "Inter_600SemiBold", color: "#111", letterSpacing: -0.2 },
  homeBrandWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 20,
  },
  homeBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  homeBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  homeBrandIconText: { color: "#fff", fontSize: rf(10), fontFamily: "Inter_700Bold" },
  homeBrandTitle: { fontSize: rf(12), fontFamily: "Inter_700Bold", color: "#111827", letterSpacing: 0.3 },
  homeBrandSub: { fontSize: rf(11), fontFamily: "Inter_500Medium", color: "#6B7280" },
  originLocBtn: {
    width: rs(26), height: rs(26), borderRadius: rs(13),
    backgroundColor: "#DC2626",
    alignItems: "center", justifyContent: "center",
  },

  cancelFab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#DC2626", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5, zIndex: 10,
  },
  cancelFabText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  topRightFabs: { position: "absolute", right: 16, flexDirection: "column", gap: 8, zIndex: 10 },
  fab: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  driverFab: { backgroundColor: "#111" },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarLetter: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  /* ── Bottom sheet (Klammert sich von der Karte ab: Lichtkante + Schlagschatten) ── */
  sheet: {
    position: "absolute", bottom: TAB_HEIGHT + 12, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth * 3,
    borderTopColor: HOME_SHEET_RIM,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(-6) },
    shadowOpacity: 0.12,
    shadowRadius: rs(18),
    elevation: 14,
    maxHeight: "76%",
  },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 8, marginBottom: 20 },
  sheetScroll: { flexShrink: 1 },

  searchIconCircle: { width: rs(34), height: rs(34), borderRadius: rs(17), justifyContent: "center", alignItems: "center" },
  miniRouteCard: {
    marginHorizontal: rs(14),
    marginBottom: rs(12),
    borderRadius: rs(18),
    backgroundColor: HOME_SHEET_PANEL,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.32,
    shadowRadius: rs(10),
    elevation: 12,
  },
  routeCardRowMini: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(14),
    paddingVertical: rs(13),
    gap: 10,
  },
  routeCardSepMini: { height: StyleSheet.hairlineWidth, marginLeft: rs(33), marginRight: rs(14) },
  miniSearchPill: {
    marginHorizontal: rs(14),
    marginTop: rs(2),
    marginBottom: rs(10),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    paddingHorizontal: rs(16),
    paddingVertical: rs(16),
    borderRadius: rs(999),
    backgroundColor: HOME_SHEET_PANEL,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.34,
    shadowRadius: rs(12),
    elevation: 14,
  },
  miniSearchPlaceholderText: {
    flex: 1,
    fontSize: rf(19),
    fontFamily: "Inter_500Medium",
    color: HOME_SHEET_MUTED,
  },
  miniActionRow: {
    flexDirection: "row",
    gap: rs(10),
    marginHorizontal: rs(14),
    marginBottom: rs(14),
    alignItems: "stretch",
  },
  miniBtnHalf: { flex: 1, minWidth: 0 },
  miniBtnPrimaryRed: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(13),
    borderRadius: rs(999),
    backgroundColor: "#DC2626",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(3) },
    shadowOpacity: 0.35,
    shadowRadius: rs(6),
    elevation: 10,
  },
  miniBtnPrimaryRedText: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  miniBtnSecondaryDark: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(13),
    borderRadius: rs(999),
    backgroundColor: HOME_SHEET_INNER,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(2) },
    shadowOpacity: 0.24,
    shadowRadius: rs(5),
    elevation: 8,
  },
  miniBtnSecondaryDarkText: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: HOME_SHEET_TEXT,
    flexShrink: 1,
  },
  miniBtnMedicalOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(13),
    paddingHorizontal: rs(8),
    borderRadius: rs(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: HOME_MEDICAL_OUTLINE_BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(1) },
    shadowOpacity: 0.06,
    shadowRadius: rs(4),
    elevation: 3,
  },
  miniBtnMedicalOutlineText: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: HOME_MEDICAL_GREEN_DARK,
    flexShrink: 1,
  },
  /** Überschrift Favoriten / Verlauf im Home-Sheet (etwas größer als klassisches Panel-Label). */
  homeQuickSectionHeading: {
    fontSize: rf(14.5),
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.35,
    marginBottom: rs(4),
    paddingHorizontal: 20,
  },
  miniBtnFull: { flexGrow: 1, flexShrink: 1 },
  routeCardDotOrigin: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "#999", borderWidth: 1.5, borderColor: "#555",
  },
  routeCardDotDest: { width: 9, height: 9, borderRadius: 5 },
  routeCardText: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },

  /* Quick destinations — etwas Abstand nach oben + dezente Trennlinie zur Suchzeile */
  quickSection: {
    marginHorizontal: rs(14),
    marginTop: rs(16),
    marginBottom: rs(10),
    paddingTop: rs(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HOME_SHEET_DIVIDER,
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: HOME_SHEET_RIM,
    backgroundColor: HOME_SHEET_PANEL,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(3) },
    shadowOpacity: 0.28,
    shadowRadius: rs(10),
    elevation: 10,
  },
  servicesTitle: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: rf(12),
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  quickIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  quickTextWrap: { flex: 1 },
  quickTitle: { fontSize: 16, fontFamily: "Inter_500Medium" },
  quickSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 1 },
  quickDivider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },

  /* Start: Dienstleistungen-Kacheln (Onroda / XL / Rollstuhl Standard) */
  vehicleSection: { paddingHorizontal: 0, paddingTop: 18, paddingBottom: 8 },
  homeServiceSection: { marginHorizontal: 16 },
  homeServiceTitleInGrid: { paddingHorizontal: 0, paddingTop: 2, paddingBottom: 8 },
  homeServiceGridRow: { gap: 14, paddingRight: 16 },
  homeServiceCard: {
    width: 86,
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 7,
    alignItems: "center",
    minHeight: 64,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  homeServiceCardCompact: {
    width: 76,
    minHeight: 58,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  homeServiceCardTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 14,
    marginTop: 4,
  },
  homeServiceCardTitleCompact: {
    fontSize: 10,
    lineHeight: 12,
    marginTop: 3,
  },

  /* Home Erweiterung unter den 4 Cards */
  homeExtraWrap: {
    marginTop: 12,
    marginHorizontal: 16,
    paddingBottom: 6,
  },
  homeChipRow: { flexDirection: "row", gap: 10 },
  homeChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  homeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  homeRecentRow: { flexDirection: "row", gap: 10, paddingRight: 16, paddingTop: 6 },
  homeRecentChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 220,
  },
  homeRecentText: { fontSize: 13, fontFamily: "Inter_500Medium", flexShrink: 1 },
  homeReserveRow: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeReserveIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  homeReserveTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  homeReserveSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* Fahrzeug-Slider (Legacy-Styles, ggf. noch für andere Screens) */
  vehicleSliderWrap: { width: "100%", alignItems: "flex-start" },
  vehicleSliderSnapContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  vehicleRefCard: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
  },
  vehicleRefCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 118,
  },
  vehicleRefLeft: { flex: 1, paddingRight: 8, justifyContent: "center" },
  vehicleRefLine1: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.4, lineHeight: 22 },
  vehicleRefLine2: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.4, lineHeight: 22, marginTop: 2 },
  vehicleRefMeta: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 8, opacity: 0.85 },
  vehicleRefCta: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
  },
  vehicleRefCtaText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  vehicleRefIllu: { width: 84, height: 90, justifyContent: "center", alignItems: "center" },
  vehicleRefHex: { position: "absolute" },
  vehicleRefShield: {
    justifyContent: "center",
    alignItems: "center",
    width: 56,
    height: 56,
  },
  vehicleRefCheck: { position: "absolute" },
  bookingVehicleScroll: { flexDirection: "row", gap: 12, paddingVertical: 8, paddingRight: 8, paddingBottom: 18 },
  bookingVehicleChip: {
    width: 112,
    flexShrink: 0,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 7,
  },
  bookingVehicleIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  bookingVehicleName: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  bookingVehicleSub: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 14 },
  vehicleSliderExpand: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  vehicleSliderExpandLine: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  vehicleSliderDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    paddingBottom: 6,
  },
  vehicleSliderDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  vehicleSliderDotActive: { width: 22, borderRadius: 4 },

  /* Fare panel */
  fareSection: { padding: 14, gap: 12, paddingBottom: 22 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 16 },
  loadingText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  routeStrip: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 18 },
  routeStripItem: { flex: 1, alignItems: "center", gap: 4 },
  fareHighlight: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginHorizontal: 8, marginVertical: 4, backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  routeStripVal: { fontSize: 28, fontFamily: "Inter_700Bold" },
  routeStripDistance: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  routeStripLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  routeStripDivider: { width: 1, height: 32 },
  routeStripDividerShort: { height: 22, alignSelf: "center" },
  panelLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -6 },
  timingRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  timingBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5,
    borderColor: "#E5E7EB", backgroundColor: "#F9FAFB",
  },
  timingBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  paymentRow: { flexDirection: "row", gap: 8 },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, minWidth: "46%" },
  paymentBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  paypalText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  euroSymbol: { fontSize: 17, fontFamily: "Inter_700Bold" },
  voucherPanel: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 10 },
  voucherPriceRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  voucherLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#1D4ED8", letterSpacing: 0.4 },
  voucherAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#1D4ED8", marginTop: 2 },
  voucherSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#3B82F6", marginTop: 4, lineHeight: 17 },
  exemptRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  exemptCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  exemptText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  voucherHint: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#93C5FD" },
  voucherHintText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#2563EB", flex: 1 },
  bookRow: { flexDirection: "row", gap: 10 },
  stickyBookRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth + 1,
    borderTopColor: HOME_SHEET_DIVIDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(-5) },
    shadowOpacity: 0.26,
    shadowRadius: rs(14),
    elevation: 14,
  },
  stickyBookCol: { flex: 1, gap: 8 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, gap: 6 },
  bookBtnText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.15 },
  bookBtnHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17 },
  scheduleBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  searchClearBtn: { padding: 2, marginLeft: 4 },
  searchClearCircle: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },

  /* Tab bar */
  tabBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 10,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(2), paddingBottom: rs(3) },
  tabIconWrap: { width: rs(28), height: rs(28), borderRadius: rs(8), justifyContent: "center", alignItems: "center", position: "relative" },
  tabLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium" },
  tabBadge: {
    position: "absolute", top: -5, right: -8,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: rs(3),
  },
  tabBadgeText: { fontSize: rf(11), fontFamily: "Inter_700Bold", color: "#fff", lineHeight: rf(14) },

  /* ══ SEARCH OVERLAY ══ */
  searchOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
  },
  searchHeader: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "column", gap: 8,
  },
  searchHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  cancelBtn: {
    paddingHorizontal: 8, paddingVertical: 6,
  },
  cancelBtnText: {
    fontSize: 15, fontFamily: "Inter_500Medium",
  },
  twoFieldCard: {
    flexDirection: "row", alignItems: "stretch",
    borderRadius: 16, borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  dotsCol: {
    width: 32, alignItems: "center",
    paddingTop: 18, paddingBottom: 18,
    gap: 2,
  },
  dotOrigin: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#222", borderWidth: 2, borderColor: "#555",
  },
  dotLine: { flex: 1, width: 2, borderRadius: 1, marginVertical: 3 },
  dotDestination: { width: 10, height: 10, borderRadius: 5 },
  fieldsCol: { flex: 1 },
  fieldWrap: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 14, gap: 8,
    borderBottomWidth: 0,
  },
  fieldInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  fieldSeparator: { height: 1, marginLeft: 8, marginRight: 8, opacity: 0.4 },
  gpsIconBtn: { padding: 4 },

  /* Results list */
  resultsContent: { padding: 16, gap: 12, paddingBottom: 40 },
  comboHintText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
  },
  searchFixpreisBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: ONRODA_MARK_RED + "44",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  searchFixpreisBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#7F1D1D",
    lineHeight: 18,
  },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -4 },
  resultGroup: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  favReorderCol: { justifyContent: "center", alignItems: "center", gap: 0 },
  resultIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  resultSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  resultDivider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  searchingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  searchingText: { fontSize: 15, fontFamily: "Inter_400Regular" },

  /* Schedule modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 19, fontFamily: "Inter_700Bold" },
  modalCloseBtn: { padding: 4 },
  modalBtnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  modalBtnPrimaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  favFormInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  favFormRow: { flexDirection: "row", gap: 10, alignItems: "stretch", marginBottom: 10 },
  favFormInputHalf: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editPresetResult: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalBtnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 14, borderWidth: 1.5 },
  modalBtnSecondaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 14, paddingVertical: 16, borderRadius: 14, borderWidth: 1,
  },
  socialBtnText: { fontSize: 17, fontFamily: "Inter_500Medium" },

  /* ── ONBOARDING ── */
  onboardingScroll: {
    flexGrow: 1, paddingHorizontal: 24, gap: 20,
  },
  onboardingBranding: {
    alignItems: "center", gap: 6, marginBottom: 8,
  },
  onboardingTitle: {
    fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -1.5,
  },
  onboardingTagline: {
    fontSize: 16, fontFamily: "Inter_400Regular",
  },
  onboardingBlock: {
    borderRadius: 20, borderWidth: 1, padding: 20, gap: 14,
  },
  onboardingBlockHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  onboardingBlockLabel: {
    fontSize: 18, fontFamily: "Inter_700Bold",
  },
  onboardingBlockSub: {
    fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -8,
  },
  onboardingInput: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  onboardingInputField: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  onboardingDriverBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 14, paddingVertical: 16,
  },
  onboardingRegisterLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 6,
  },
  onboardingRegisterLinkText: {
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  onboardingDivider: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginVertical: -4,
  },
  onboardingDividerLine: { flex: 1, height: 1 },
  onboardingDividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
