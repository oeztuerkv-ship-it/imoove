import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
  usePathname,
  useSegments,
  type Href,
} from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  BottomTabBar,
  BOTTOM_TAB_BAR_HOME_OFFSET_Y,
  BOTTOM_TAB_BAR_INNER_HEIGHT,
  BOTTOM_TAB_BAR_OUTER_PADDING_X,
} from "@/components/BottomTabBar";
import { RealMapView } from "@/components/RealMapView";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { onrodaTheme } from "@/src/theme";
import { useDriver } from "@/context/DriverContext";
import {
  type RideHistoryEntry,
  type RideServiceClass,
  type VehicleType,
  VEHICLES,
  useRide,
} from "@/context/RideContext";
import {
  HOME_SHEET_DIVIDER,
  HOME_SHEET_INNER,
  HOME_SHEET_MUTED,
  HOME_SHEET_PANEL,
  HOME_SHEET_RIM,
  HOME_SHEET_TEXT,
} from "@/constants/homeSheetChrome";
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

/** „Exklusive Angebote“ / „Neuigkeiten“: klassisches Weiß (nicht Creme / Theme-Offwhite). */
const SPONSOR_NEWS_CARD_WHITE = "#FFFFFF";
const SPONSOR_NEWS_CARD_BORDER = "#E5E7EB";

const HOME_MEDICAL_GREEN = "#059669";
const HOME_MEDICAL_GREEN_DARK = "#047857";
/** Krankenfahrt-Pille: kräftiger Rand, heller Grund (Bild 2). */
const HOME_MEDICAL_SOFT_BG = "#ECFDF5";

const FAVORITES_STORAGE_KEY = "@Onroda_search_favorites_v1";
const MAX_FAVORITES_STORED = 5;
const MAX_FAVORITES_ON_HOME = 2;
const MAX_HOME_HISTORY = 2;
const MAX_VIA_STOPS = 4;

interface SearchFavorite {
  id: string;
  label: string;
  location: GeoLocation;
}

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

/** Reserviert Platz unter der Karte inkl. nach-unten geschobener Tab-Pille auf Home. */
const TAB_HEIGHT = BOTTOM_TAB_BAR_INNER_HEIGHT + BOTTOM_TAB_BAR_HOME_OFFSET_Y;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const bottomPad = isWeb ? 20 : insets.bottom;
  // Responsive onboarding helpers
  const isSmallScreen = screenHeight < 700;    // iPhone SE / iPhone 8
  const isMediumScreen = screenHeight < 850;   // iPhone 13/14
  const obGap = isSmallScreen ? 14 : isMediumScreen ? 18 : 24;
  const obTitleSize = isSmallScreen ? 24 : 30;
  const obBlockPad = isSmallScreen ? 14 : 20;

  const [isHomeFocused, setIsHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsHomeFocused(true);
      setIsSearchActive(false);
      setDestQuery("");
      setDestResults([]);
      setOriginQuery("");
      setOriginResults([]);
      setIsEditingOrigin(false);
      setViaStops([]);
      resetRide();
      return () => setIsHomeFocused(false);
    }, []),
  );
  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn, driver: driverProfile } = useDriver();
  const { profile, updateProfile, loginWithGoogle, registerLocalCustomer } = useUser();

  const {
    origin, viaStops, destination, selectedVehicle, paymentMethod,
    route, fareBreakdown, isLoadingRoute, routeError, scheduledTime,
    selectedServiceClass,
    setOrigin, setViaStops, setDestination, setSelectedVehicle, setSelectedServiceClass, setPaymentMethod,
    setScheduledTime, fetchRoute, resetRide, history, setWheelchairSelectCompleted,
  } = useRide();

  useEffect(() => {
    if (selectedVehicle !== "wheelchair") setWheelchairSelectCompleted(false);
  }, [selectedVehicle, setWheelchairSelectCompleted]);

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
    router.replace("/booking-center" as Href);
  }, [customerAppBlocked, blockedCustomerAlert]);

  const goReserveNewBooking = useCallback(() => {
    if (customerAppBlocked) {
      blockedCustomerAlert();
      return;
    }
    setScheduledTime(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/new-booking" as Href);
  }, [customerAppBlocked, blockedCustomerAlert, setScheduledTime]);

  const goMedicalBooking = useCallback(() => {
    if (customerAppBlocked) {
      blockedCustomerAlert();
      return;
    }
    resetRide();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/booking-medical" as Href);
  }, [customerAppBlocked, blockedCustomerAlert, resetRide]);

  /* ── Onboarding: shown whenever neither customer nor driver is logged in ── */
  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;

  type AppNewsItem = {
    id: string;
    title: string;
    body: string;
    imageUrl: string | null;
    buttonText: string | null;
    targetType: string;
    targetValue: string | null;
  };
  const [appNewsItems, setAppNewsItems] = useState<AppNewsItem[]>([]);
  const [appNewsDetail, setAppNewsDetail] = useState<AppNewsItem | null>(null);
  const [appNewsSlideIndex, setAppNewsSlideIndex] = useState(0);
  const newsAudience = isDriverLoggedIn ? "driver" : "customer";
  type SponsorTeaserItem = {
    id: string;
    title: string;
    description: string;
    imageUrl: string | null;
    category: string;
  };
  const [sponsorTeasers, setSponsorTeasers] = useState<SponsorTeaserItem[]>([]);
  const homeTopOrder =
    typeof (platformConfig.features as { homepageTopOrder?: unknown } | undefined)?.homepageTopOrder === "string"
      ? String((platformConfig.features as { homepageTopOrder?: unknown }).homepageTopOrder)
      : "sponsors_then_news";
  const sponsorTeaserTitle =
    typeof (platformConfig.messages as { sponsorsTeaserTitleCustomerDe?: unknown } | undefined)?.sponsorsTeaserTitleCustomerDe === "string"
      ? String((platformConfig.messages as { sponsorsTeaserTitleCustomerDe?: unknown }).sponsorsTeaserTitleCustomerDe).trim() ||
        "Exklusive Angebote"
      : typeof (platformConfig.messages as { sponsorsTeaserTitleDe?: unknown } | undefined)?.sponsorsTeaserTitleDe === "string"
        ? String((platformConfig.messages as { sponsorsTeaserTitleDe?: unknown }).sponsorsTeaserTitleDe).trim() || "Exklusive Angebote"
        : "Exklusive Angebote";
  const sponsorTeaserBody =
    typeof (platformConfig.messages as { sponsorsTeaserBodyCustomerDe?: unknown } | undefined)?.sponsorsTeaserBodyCustomerDe === "string"
      ? String((platformConfig.messages as { sponsorsTeaserBodyCustomerDe?: unknown }).sponsorsTeaserBodyCustomerDe).trim() ||
        "Entdecke Partner, Aktionen und Angebote in deiner Nähe."
      : typeof (platformConfig.messages as { sponsorsTeaserBodyDe?: unknown } | undefined)?.sponsorsTeaserBodyDe === "string"
        ? String((platformConfig.messages as { sponsorsTeaserBodyDe?: unknown }).sponsorsTeaserBodyDe).trim() ||
        "Entdecke Partner, Aktionen und Angebote in deiner Nähe."
        : "Entdecke Partner, Aktionen und Angebote in deiner Nähe.";

  const APP_NEWS_CAROUSEL_PAD = 20;
  const APP_NEWS_CAROUSEL_GAP = 12;
  const SPONSORS_DETAIL_ROUTE = "/sponsors?open=top";
  const appNewsSlideWidth = useMemo(() => {
    const w = Math.min(Math.max(screenWidth - APP_NEWS_CAROUSEL_PAD * 2 - APP_NEWS_CAROUSEL_GAP, 260), screenWidth - 24);
    return Math.round(w);
  }, [screenWidth]);
  const appNewsStride = appNewsSlideWidth + APP_NEWS_CAROUSEL_GAP;

  useEffect(() => {
    setAppNewsSlideIndex(0);
  }, [appNewsItems]);

  useEffect(() => {
    if (!isHomeFocused || showOnboarding) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const url = `${API_URL}/app/news?audience=${encodeURIComponent(newsAudience)}&limit=5`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!data?.ok || !Array.isArray(data.items) || cancelled) return;
        setAppNewsItems(data.items);
      } catch {
        if (!cancelled) setAppNewsItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHomeFocused, showOnboarding, newsAudience]);

  useEffect(() => {
    if (!isHomeFocused || showOnboarding) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const audience = isDriverLoggedIn ? "driver" : "customer";
        const url = `${API_URL}/app/sponsors?audience=${encodeURIComponent(audience)}&limit=3`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!data?.ok || !Array.isArray(data.items) || cancelled) return;
        setSponsorTeasers(data.items);
      } catch {
        if (!cancelled) setSponsorTeasers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHomeFocused, showOnboarding, isDriverLoggedIn]);

  const openAppNewsItem = useCallback((item: AppNewsItem) => {
    const internalRe =
      /^\/(help|wallet|my-rides|profile|booking-center|status|ride-detail|personal-info|google-auth|login-success)(\/|$)/;
    const tt = String(item.targetType ?? "").trim();
    const tv = String(item.targetValue ?? "").trim();
    if (tt === "internal_screen" && tv === "/sponsors") {
      router.push(SPONSORS_DETAIL_ROUTE as Href);
      return;
    }
    if (tt === "internal_screen" && tv && internalRe.test(tv)) {
      router.push(tv as Href);
      return;
    }
    if (tt === "external_url" && tv) {
      void WebBrowser.openBrowserAsync(tv);
      return;
    }
    setAppNewsDetail(item);
  }, [SPONSORS_DETAIL_ROUTE]);

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

  /* ── Such-/Buchungs-Steuerung per URL (?openBooking=instant, Legacy ?search=1, ?closeSearch=1) ── */
  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams<{
    search?: string;
    closeSearch?: string;
    openBooking?: string;
    dest?: string;
  }>();
  const searchParam = params.search;
  const closeSearchParam = params.closeSearch;
  const openBookingParam = params.openBooking;
  const destParam = params.dest;

  useEffect(() => {
    console.log(
      `[NAV TRACE] MOUNT ${pathname}`,
      JSON.stringify(
        {
          screen: "index",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
    return () => {
      console.log(`[NAV TRACE] UNMOUNT ${pathname}`);
    };
    // Nur Mount/Unmount des Screens loggen (bewusst ohne pathname/params in deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- NAV trace: einmaliger Mount-Log
  }, []);

  useEffect(() => {
    console.log(
      `[NAV TRACE] UPDATE ${pathname}`,
      JSON.stringify(
        {
          screen: "index",
          pathname,
          segments,
          params,
        },
        null,
        2,
      ),
    );
  }, [pathname, JSON.stringify(params), JSON.stringify(segments)]);

  const [isEditingOrigin, setIsEditingOrigin] = useState(false);

  const [userGps, setUserGps] = useState<{ lat: number; lon: number } | null>(null);

  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<GeoLocation[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);
  const originInputRef = useRef<TextInput>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!destParam) return;
    const loc: GeoLocation = {
      displayName: destParam,
      lat: 0,
      lon: 0,
    };
    setDestination(loc);
    setIsSearchActive(false);
  }, [destParam]);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<GeoLocation[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const destInputRef = useRef<TextInput>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Nach Zeitbestätigung: Suchmaske öffnen und zuerst Abholort fokussieren. */
  const focusPickupFieldOnSearchOpenRef = useRef(false);

  type ViaSearchLeg = {
    id: string;
    query: string;
    results: GeoLocation[];
    isSearching: boolean;
    location: GeoLocation | null;
  };
  const [viaSearchLegs, setViaSearchLegs] = useState<ViaSearchLeg[]>([]);
  const [editingViaIndex, setEditingViaIndex] = useState<number | null>(null);
  const viaInputRefs = useRef<(TextInput | null)[]>([]);
  const viaDebounceRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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

  /* ── Edit-Preset Modal ── */
  const [editPreset, setEditPreset] = useState<"home" | "work" | null>(null);
  const [editPresetQuery, setEditPresetQuery] = useState("");
  const [editPresetResults, setEditPresetResults] = useState<GeoLocation[]>([]);
  const [editPresetLoading, setEditPresetLoading] = useState(false);
  const [selectedEditResult, setSelectedEditResult] = useState<GeoLocation | null>(null);

  const savePreset = (type: "home" | "work", loc: GeoLocation) => {
    if (type === "home") {
      AsyncStorage.setItem("@Onroda_home", JSON.stringify(loc)).catch(() => {});
    } else {
      AsyncStorage.setItem("@Onroda_work", JSON.stringify(loc)).catch(() => {});
    }
    setIsSearchActive(false);
    setDestQuery("");
    setDestResults([]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  /* Edit-Preset-Suche */
  const editPresetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editPreset) return;
    if (editPresetDebounceRef.current) clearTimeout(editPresetDebounceRef.current);
    if (editPresetQuery.length < 2) { setEditPresetResults([]); setSelectedEditResult(null); return; }
    editPresetDebounceRef.current = setTimeout(async () => {
      setEditPresetLoading(true);
      try {
        const locs = await searchLocation(editPresetQuery, userGps ?? undefined);
        setEditPresetResults(locs);
      } catch { setEditPresetResults([]); }
      finally { setEditPresetLoading(false); }
    }, 300);
  }, [editPresetQuery, editPreset]);

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
    setViaSearchLegs(
      viaStops.map((loc) => ({
        id: `via-${loc.lat}-${loc.lon}-${Math.random().toString(36).slice(2, 9)}`,
        query: loc.displayName.split(",")[0]?.trim() || loc.displayName,
        results: [],
        isSearching: false,
        location: loc,
      })),
    );
    setEditingViaIndex(null);
    viaInputRefs.current = [];
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
  }, [isSearchActive, origin.displayName, destination, viaStops]);

  /* ── Suchmaske: Fokus Start / Zwischenstopp / Ziel ── */
  useEffect(() => {
    if (!isSearchActive) return;
    if (isEditingOrigin && editingViaIndex === null) {
      setTimeout(() => originInputRef.current?.focus(), 80);
    } else if (editingViaIndex !== null) {
      setTimeout(() => viaInputRefs.current[editingViaIndex]?.focus(), 80);
    } else {
      setTimeout(() => destInputRef.current?.focus(), 80);
    }
  }, [isEditingOrigin, editingViaIndex, isSearchActive]);

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
    setEditingViaIndex(null);
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

  const addViaSearchLeg = useCallback(() => {
    setIsEditingOrigin(false);
    setViaSearchLegs((prev) => {
      if (prev.length >= MAX_VIA_STOPS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      const newIdx = prev.length;
      setTimeout(() => {
        setEditingViaIndex(newIdx);
        setTimeout(() => viaInputRefs.current[newIdx]?.focus(), 80);
      }, 0);
      return [
        ...prev,
        {
          id: `via-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          query: "",
          results: [],
          isSearching: false,
          location: null,
        },
      ];
    });
  }, []);

  const removeViaSearchLeg = useCallback((index: number) => {
    const t = viaDebounceRef.current.get(index);
    if (t) clearTimeout(t);
    viaDebounceRef.current.delete(index);
    setViaSearchLegs((prev) => prev.filter((_, j) => j !== index));
    setEditingViaIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleViaLegQueryChange = useCallback(
    (index: number, text: string) => {
      if (text.length === 0) {
        const prevT = viaDebounceRef.current.get(index);
        if (prevT) clearTimeout(prevT);
        viaDebounceRef.current.delete(index);
        setViaSearchLegs((prev) => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], query: "", results: [], isSearching: false, location: null };
          return next;
        });
        return;
      }
      setViaSearchLegs((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = { ...next[index], query: text };
        return next;
      });
      const prevT = viaDebounceRef.current.get(index);
      if (prevT) clearTimeout(prevT);
      if (text.length < 2) {
        setViaSearchLegs((prev) => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], results: [], isSearching: false };
          return next;
        });
        return;
      }
      const t = setTimeout(async () => {
        setViaSearchLegs((prev) => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], isSearching: true };
          return next;
        });
        try {
          const locs = await searchLocation(text, userGps ?? undefined);
          setViaSearchLegs((prev) => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], results: locs.slice(0, 6), isSearching: false };
            return next;
          });
        } catch {
          setViaSearchLegs((prev) => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], results: [], isSearching: false };
            return next;
          });
        }
      }, 300);
      viaDebounceRef.current.set(index, t);
    },
    [userGps],
  );

  const handleViaLegSelect = useCallback((index: number, loc: GeoLocation) => {
    setViaSearchLegs((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = {
        ...next[index],
        location: loc,
        query: loc.displayName.split(",")[0]?.trim() || loc.displayName,
        results: [],
        isSearching: false,
      };
      return next;
    });
    setEditingViaIndex(null);
    setIsEditingOrigin(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => destInputRef.current?.focus(), 100);
  }, []);

  /** Verlauf: Suche öffnen, aktuellen Abholstandort beibehalten, Ziel wie damals laden. */
  const openSearchWithHistoryEntry = useCallback(
    async (entry: RideHistoryEntry) => {
      setIsSearchActive(true);
      setViaStops([]);
      setViaSearchLegs([]);
      setEditingViaIndex(null);
      setIsEditingOrigin(false);
      setOriginQuery(origin.displayName.split(",")[0]);
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
    [origin.displayName, userGps, setViaStops],
  );

  const handleDestinationSelect = (loc: GeoLocation) => {
    const resolved = viaSearchLegs.map((l) => l.location).filter((x): x is GeoLocation => x !== null);
    setViaStops(resolved);
    setDestination(loc);
    setDestQuery("");
    setDestResults([]);
    setViaSearchLegs([]);
    setEditingViaIndex(null);
    setIsSearchActive(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/ride-select" as Href);
  };

  const closeSearch = () => {
    viaDebounceRef.current.forEach((tid) => clearTimeout(tid));
    viaDebounceRef.current.clear();
    setIsSearchActive(false);
    setDestQuery("");
    setDestResults([]);
    setOriginQuery("");
    setOriginResults([]);
    setIsEditingOrigin(false);
    setViaSearchLegs([]);
    setEditingViaIndex(null);
    setViaStops([]);
  };

  useEffect(() => {
    if (closeSearchParam === "1") {
      closeSearch();
      void router.setParams({ closeSearch: undefined });
    }
  }, [closeSearchParam]);

  /** Sofortfahrt: nach useFocusEffect (setTimeout 0), damit die Suchmaske nicht sofort wieder zu gemacht wird. */
  useEffect(() => {
    const wantsInstantSheet = searchParam === "1" || openBookingParam === "instant";
    if (!wantsInstantSheet) return undefined;
    const t = setTimeout(() => {
      setBookingMode("immediate");
      setScheduledTime(null);
      setIsSearchActive(true);
      try {
        void router.setParams({ search: undefined, openBooking: undefined });
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [searchParam, openBookingParam, setScheduledTime]);

  const goToDirectCheckout = useCallback(() => {
    if (!selectedVehicle) {
      Alert.alert("Fahrzeug wählen", "Bitte wählen Sie zuerst ein Fahrzeug aus.");
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
  }, [selectedVehicle, isLoadingRoute, fareBreakdown, bookingMode, setScheduledTime]);

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
  const showOriginResults = isEditingOrigin && editingViaIndex === null && (originResults.length > 0 || isSearchingOrigin);
  const showDestResults = !isEditingOrigin && editingViaIndex === null && destResults.length > 0;
  const activeViaLeg = editingViaIndex !== null ? viaSearchLegs[editingViaIndex] : undefined;
  const showViaResults =
    editingViaIndex !== null &&
    activeViaLeg != null &&
    (activeViaLeg.results.length > 0 || activeViaLeg.isSearching);
  const showFavoriteBlock =
    !isEditingOrigin && editingViaIndex === null && destResults.length === 0 && !isSearchingDest;
  const mapEdgePaddingTop = Math.round(!destination ? topPad + 8 + 62 : topPad + 12 + 46);
  const mapEdgePaddingBottom = Math.round(
    destination
      ? Math.min(380, Math.max(260, screenHeight * 0.32 + TAB_HEIGHT))
      : Math.min(460, TAB_HEIGHT + screenHeight * 0.4),
  );

  /* ── Driver guard: while AsyncStorage loads, show nothing; when logged in, redirect ── */
  if (driverLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center" }}>
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
  /* Unterliegende Home-UI (Sheet, Chips, …) nicht rendern, wenn ein anderer Stack-Screen oben liegt —
     sonst wirkt es wie „Doppel-UI“ / mischt sich mit z. B. /new-booking (zusätzlich zur MapView-Problematik). */
  if (!isHomeFocused) {
    const underlay = profile.isLoggedIn ? colors.background : "#FFFFFF";
    return <View style={{ flex: 1, backgroundColor: underlay }} />;
  }

  const mapDockBottom = TAB_HEIGHT + bottomPad;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {profile.isLoggedIn ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: mapDockBottom,
            overflow: "hidden",
            backgroundColor: colors.background,
          }}
        >
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
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]} />
      )}

      {profile.isLoggedIn ? (<>

      {/* GPS: in der Such-Pille integriert — kein schwebender FAB mehr */}
      {/* ── TOP-RIGHT: nur Abbrechen bei aktiver Route ── */}
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
            backgroundColor: colors.surface,
            maxHeight: destination ? "86%" : "66%",
            bottom: mapDockBottom,
            transform: [{ translateY: rs(12) }],
            zIndex: 20,
            ...(Platform.OS === "android" ? { elevation: 26 } : {}),
          },
        ]}
      >

        {/* Suche / Route-Anzeige */}
        {destination ? (
          /* ── Zwei-Zeilen-Karte mit Trennlinie (Option B) ── */
          <Pressable
            style={[styles.routeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
          >
            {/* Start-Zeile */}
            <View style={styles.routeCardRow}>
              <View style={styles.routeCardDotOrigin} />
              <Text style={[styles.routeCardText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {origin.displayName}
              </Text>
            </View>
            {/* Trennlinie */}
            <View style={[styles.routeCardSep, { backgroundColor: colors.border }]} />
            {/* Ziel-Zeile */}
            <View style={styles.routeCardRow}>
              <View style={[styles.routeCardDotDest, { backgroundColor: colors.primary }]} />
              <Text style={[styles.routeCardText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
                {destination.displayName}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={(e) => { e.stopPropagation(); resetRide(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={styles.searchClearBtn}
              >
                <View style={[styles.searchClearCircle, { backgroundColor: colors.mutedForeground + "30" }]}>
                  <Feather name="x" size={12} color={colors.foreground} />
                </View>
              </Pressable>
            </View>
          </Pressable>
        ) : (
          <>
            <View style={styles.miniSearchPill}>
              <Pressable
                style={styles.miniSearchPillMain}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
              >
                <View style={[styles.miniSearchIconCircle, { backgroundColor: colors.primary }]}>
                  <Feather name="search" size={19} color="#fff" />
                </View>
                <Text style={styles.miniSearchPlaceholderText} numberOfLines={1}>
                  Ziel eingeben...
                </Text>
              </Pressable>
              <Pressable
                style={styles.miniGpsBtn}
                onPress={() => { void handleGpsLocate(); }}
                disabled={gpsLoading}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Standort auf Karte"
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="navigation" size={19} color={colors.primary} />
                )}
              </Pressable>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Ziel suchen"
              >
                <Feather name="chevron-right" size={20} color={HOME_SHEET_MUTED} />
              </Pressable>
            </View>
            <View style={styles.miniActionRow}>
              {preBookingOn ? (
                <>
                  <Pressable style={[styles.miniBtnSheetWhite, styles.miniBtnHalf]} onPress={goReserveNewBooking}>
                    <Feather name="calendar" size={16} color={HOME_SHEET_TEXT} />
                    <Text style={styles.miniBtnSheetWhiteText} numberOfLines={1}>
                      Reservieren
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtnSheetMedical, styles.miniBtnHalf]} onPress={goMedicalBooking}>
                    <MaterialCommunityIcons name="medical-bag" size={17} color={HOME_MEDICAL_GREEN_DARK} />
                    <Text style={styles.miniBtnSheetMedicalText} numberOfLines={1}>
                      Krankenfahrt
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={[styles.miniBtnSecondaryDark, styles.miniBtnHalf]} onPress={goBookingCenter}>
                    <Feather name="layers" size={20} color={HOME_SHEET_TEXT} />
                    <Text style={styles.miniBtnSecondaryDarkText} numberOfLines={1}>
                      Buchungszentrale
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtnSheetMedical, styles.miniBtnHalf]} onPress={goMedicalBooking}>
                    <MaterialCommunityIcons name="medical-bag" size={17} color={HOME_MEDICAL_GREEN_DARK} />
                    <Text style={styles.miniBtnSheetMedicalText} numberOfLines={1}>
                      Krankenfahrt
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={[styles.sheetScroll, { backgroundColor: colors.surface }]}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: rs(16) }}
        >
          {globalNoticeDe.length > 0 ? (
            <View
              style={{
                marginHorizontal: 20,
                marginBottom: 10,
                padding: 12,
                borderRadius: 10,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>{globalNoticeDe}</Text>
            </View>
          ) : null}
          {!showOnboarding && homeTopOrder !== "news_then_sponsors" && sponsorTeasers.length > 0 ? (
            <Pressable
              style={[styles.sponsorTeaserCard, { marginHorizontal: 20, marginBottom: 10, borderColor: SPONSOR_NEWS_CARD_BORDER, backgroundColor: SPONSOR_NEWS_CARD_WHITE }]}
              onPress={() => router.push(SPONSORS_DETAIL_ROUTE as Href)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sponsorTeaserEyebrow, { color: colors.primary }]}>Exklusive Angebote</Text>
                <Text style={[styles.sponsorTeaserTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {sponsorTeaserTitle}
                </Text>
                <Text style={[styles.sponsorTeaserText, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {sponsorTeaserBody}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {!showOnboarding && appNewsItems.length > 0 ? (
            <View style={{ marginBottom: rs(12) }}>
              <Text style={[styles.appNewsHeading, { marginHorizontal: APP_NEWS_CAROUSEL_PAD }]}>Neuigkeiten</Text>
              {appNewsItems.length === 1 ? (
                <View style={{ marginHorizontal: APP_NEWS_CAROUSEL_PAD }}>
                  <Pressable
                    style={[
                      styles.appNewsSlideCard,
                      { backgroundColor: SPONSOR_NEWS_CARD_WHITE, borderColor: SPONSOR_NEWS_CARD_BORDER, width: "100%" },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      openAppNewsItem(appNewsItems[0]);
                    }}
                  >
                    {appNewsItems[0].imageUrl ? (
                      <Image source={{ uri: appNewsItems[0].imageUrl }} style={styles.appNewsSlideImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.appNewsSlideImage, styles.appNewsSlideImagePlaceholder]} />
                    )}
                    <View style={styles.appNewsSlideBody}>
                      <Text style={[styles.appNewsSlideTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={2}>
                        {appNewsItems[0].title}
                      </Text>
                      <Text style={[styles.appNewsSlideBodyText, { color: HOME_SHEET_MUTED }]} numberOfLines={2}>
                        {appNewsItems[0].body}
                      </Text>
                      {appNewsItems[0].buttonText ? (
                        <View style={[styles.appNewsSlideCta, { backgroundColor: colors.primary }]}>
                          <Text style={styles.appNewsSlideCtaText}>{appNewsItems[0].buttonText}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={appNewsStride}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    contentContainerStyle={{
                      paddingHorizontal: APP_NEWS_CAROUSEL_PAD,
                      paddingBottom: rs(6),
                    }}
                    onScroll={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      const idx = Math.round(x / appNewsStride);
                      setAppNewsSlideIndex(Math.min(appNewsItems.length - 1, Math.max(0, idx)));
                    }}
                    scrollEventThrottle={16}
                  >
                    {appNewsItems.map((it, idx) => (
                      <View
                        key={it.id}
                        style={{
                          width: appNewsSlideWidth,
                          marginRight: idx < appNewsItems.length - 1 ? APP_NEWS_CAROUSEL_GAP : 0,
                        }}
                      >
                        <Pressable
                          style={[
                            styles.appNewsSlideCard,
                            { backgroundColor: SPONSOR_NEWS_CARD_WHITE, borderColor: SPONSOR_NEWS_CARD_BORDER, width: "100%" },
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            openAppNewsItem(it);
                          }}
                        >
                          {it.imageUrl ? (
                            <Image source={{ uri: it.imageUrl }} style={styles.appNewsSlideImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.appNewsSlideImage, styles.appNewsSlideImagePlaceholder]} />
                          )}
                          <View style={styles.appNewsSlideBody}>
                            <Text style={[styles.appNewsSlideTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={2}>
                              {it.title}
                            </Text>
                            <Text style={[styles.appNewsSlideBodyText, { color: HOME_SHEET_MUTED }]} numberOfLines={2}>
                              {it.body}
                            </Text>
                            {it.buttonText ? (
                              <View style={[styles.appNewsSlideCta, { backgroundColor: colors.primary }]}>
                                <Text style={styles.appNewsSlideCtaText}>{it.buttonText}</Text>
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.appNewsDotsRow}>
                    {appNewsItems.map((_, i) => (
                      <View
                        key={`dot-${i}`}
                        style={[
                          styles.appNewsDot,
                          i === appNewsSlideIndex ? { backgroundColor: colors.primary } : { backgroundColor: HOME_SHEET_RIM },
                        ]}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : null}
          {!showOnboarding && homeTopOrder === "news_then_sponsors" && sponsorTeasers.length > 0 ? (
            <Pressable
              style={[styles.sponsorTeaserCard, { marginHorizontal: 20, marginBottom: 10, borderColor: SPONSOR_NEWS_CARD_BORDER, backgroundColor: SPONSOR_NEWS_CARD_WHITE }]}
              onPress={() => router.push(SPONSORS_DETAIL_ROUTE as Href)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sponsorTeaserEyebrow, { color: colors.primary }]}>Exklusive Angebote</Text>
                <Text style={[styles.sponsorTeaserTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {sponsorTeaserTitle}
                </Text>
                <Text style={[styles.sponsorTeaserText, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {sponsorTeaserBody}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {!destination ? (
            <>
              <View style={styles.homeQuickSection}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: rs(4),
                    paddingHorizontal: rs(14),
                  }}
                >
                  <Text style={[styles.homeQuickSectionHeading, { color: HOME_SHEET_MUTED, paddingHorizontal: 0 }]}>
                    Favoriten
                  </Text>
                  {searchFavorites.length < MAX_FAVORITES_STORED ? (
                    <Pressable onPress={() => openAddFavoriteModal()} hitSlop={8}>
                      <Text style={{ fontSize: rf(13), fontFamily: "Inter_600SemiBold", color: colors.primary }}>+ Neu</Text>
                    </Pressable>
                  ) : null}
                </View>
                {searchFavorites.length === 0 ? (
                  <Pressable
                    style={styles.homeQuickRow}
                    onPress={() => openAddFavoriteModal()}
                  >
                    <View style={[styles.homeQuickIconWrap, { backgroundColor: HOME_SHEET_INNER }]}>
                      <Feather name="bookmark" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.quickTextWrap}>
                      <Text style={[styles.homeQuickTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={1}>
                        Ersten Favoriten anlegen
                      </Text>
                      <Text style={[styles.homeQuickSub, { color: HOME_SHEET_MUTED }]} numberOfLines={2}>
                        Tippen zum Hinzufügen
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={HOME_SHEET_MUTED} />
                  </Pressable>
                ) : (
                  searchFavorites.slice(0, MAX_FAVORITES_ON_HOME).map((fav, favIdx) => (
                    <React.Fragment key={fav.id}>
                      {favIdx > 0 ? <View style={[styles.homeQuickDivider, { backgroundColor: HOME_SHEET_DIVIDER }]} /> : null}
                      <View style={styles.homeQuickRow}>
                        <Pressable
                          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                          onPress={() => handleDestinationSelect(fav.location)}
                        >
                          <View style={[styles.homeQuickIconWrap, { backgroundColor: HOME_SHEET_INNER }]}>
                            <Feather name="map-pin" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.quickTextWrap}>
                            <Text style={[styles.homeQuickTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={1}>{fav.label}</Text>
                            <Text style={[styles.homeQuickSub, { color: HOME_SHEET_MUTED }]} numberOfLines={1}>
                              {fav.location.displayName}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable hitSlop={12} onPress={() => removeSearchFavorite(fav.id)}>
                          <Feather name="trash-2" size={18} color={HOME_SHEET_MUTED} />
                        </Pressable>
                      </View>
                    </React.Fragment>
                  ))
                )}
                {homeHistorySlice.length > 0 ? (
                  <>
                    <View style={[styles.homeQuickDivider, { backgroundColor: HOME_SHEET_DIVIDER, marginTop: rs(8) }]} />
                    <Text style={[styles.homeQuickSectionHeading, { color: HOME_SHEET_MUTED, marginTop: rs(4), marginBottom: rs(4) }]}>
                      Verlauf
                    </Text>
                    {homeHistorySlice.map((hItem, hi) => (
                      <React.Fragment key={hItem.id}>
                        {hi > 0 ? <View style={[styles.homeQuickDivider, { backgroundColor: HOME_SHEET_DIVIDER }]} /> : null}
                        <Pressable
                          style={styles.homeQuickRow}
                          onPress={() => void openSearchWithHistoryEntry(hItem)}
                        >
                          <View style={[styles.homeQuickIconWrap, { backgroundColor: HOME_SHEET_INNER }]}>
                            <Ionicons name="time-outline" size={18} color={HOME_SHEET_TEXT} />
                          </View>
                          <View style={styles.quickTextWrap}>
                            <Text style={[styles.homeQuickTitle, { color: HOME_SHEET_TEXT }]} numberOfLines={1}>
                              {hItem.destination.split(",")[0]}
                            </Text>
                            <Text style={[styles.homeQuickSub, { color: HOME_SHEET_MUTED }]} numberOfLines={2}>
                              {hItem.destination.split(",").slice(1, 3).join(",").trim() || hItem.origin.split(",")[0]}
                            </Text>
                          </View>
                          <Feather name="search" size={18} color={HOME_SHEET_MUTED} />
                        </Pressable>
                      </React.Fragment>
                    ))}
                  </>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.fareSection}>
              <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>BUCHUNG</Text>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: colors.foreground,
                  lineHeight: 20,
                  marginBottom: 12,
                }}
              >
                Ziel gesetzt. Wähle jetzt dein Fahrzeug - der Preis wird direkt angezeigt.
              </Text>
              <Text style={[styles.panelLabel, { color: colors.mutedForeground, marginTop: 4 }]}>FAHRZEUG</Text>
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
                          borderWidth: active ? 2 : 1.5,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + "12" : colors.card,
                        },
                      ]}
                      onPress={() => {
                        if (v.id === "wheelchair") {
                          setSelectedServiceClass("rollstuhl");
                        } else if (v.id === "xl") {
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
                          { backgroundColor: active ? colors.primary + "20" : iconCfg.bg },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={iconCfg.icon as any}
                          size={24}
                          color={iconCfg.color}
                        />
                      </View>
                      <Text style={[styles.bookingVehicleName, { color: active ? colors.primary : colors.foreground }]}>
                        {v.id === "standard" ? "Standard Taxi" : v.name}
                      </Text>
                      <Text style={[styles.bookingVehicleSub, { color: colors.mutedForeground }]}>
                        {iconCfg.seats}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* ── Service-Badges aus Patienten-Profil ── */}
              {(profile.rollator || profile.blindenhund || profile.sauerstoff || profile.begleitperson ||
                profile.abholungTuer || profile.begleitungAnmeldung || profile.tragehilfe || profile.dialyse) && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>SERVICE</Text>
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
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Route wird berechnet...</Text>
                </View>
              ) : routeError ? (
                <View style={[styles.loadingRow, { marginTop: 14 }]}>
                  <Feather name="alert-circle" size={18} color={colors.destructive} />
                  <Text style={[styles.loadingText, { color: colors.destructive }]}>{routeError}</Text>
                </View>
              ) : route?.distanceKm != null ? (
                <View style={[styles.routeStrip, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14, alignItems: "stretch" }]}>
                  <View style={[styles.routeStripItem, { justifyContent: "center" }]}>
                    <Text style={[styles.routeStripDistance, { color: colors.mutedForeground }]}>
                      {Number(route.distanceKm).toFixed(1)} km
                    </Text>
                  </View>
                  <View style={[styles.routeStripDivider, styles.routeStripDividerShort, { backgroundColor: colors.border }]} />
                  <View style={[styles.routeStripItem, styles.fareHighlight, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                    <Text style={[styles.routeStripLabel, { color: colors.mutedForeground, marginBottom: 2 }]}>Preis</Text>
                    <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>
                      {fareBreakdown ? formatEuro(fareBreakdown.total) : "—"}
                    </Text>
                  </View>
                </View>
              ) : null}

            </View>
          )}
        </ScrollView>

        {destination && selectedVehicle && !isLoadingRoute && !routeError && route && (
          <View style={[styles.stickyBookRow, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 18 + bottomPad + 12 }]}>
            <View style={styles.stickyBookCol}>
              <Pressable
                style={[
                  styles.bookBtn,
                  {
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: "rgba(220, 38, 38, 0.35)",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 5,
                    elevation: 3,
                  },
                ]}
                onPress={goToDirectCheckout}
              >
                <Text style={[styles.bookBtnText, { color: "#fff" }]}>Taxi jetzt bestellen</Text>
              </Pressable>
              <Text style={[styles.bookBtnHint, { color: colors.mutedForeground }]}>
                Fahrzeug und Preis sind festgelegt. Im nächsten Schritt bestätigen Sie die Bestellung.
              </Text>
            </View>
          </View>
        )}
      </View>

      <Modal visible={appNewsDetail != null} animationType="slide" transparent onRequestClose={() => setAppNewsDetail(null)}>
        <Pressable style={styles.appNewsModalBackdrop} onPress={() => setAppNewsDetail(null)}>
          <Pressable
            style={[styles.appNewsModalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {appNewsDetail?.imageUrl ? (
                <Image source={{ uri: appNewsDetail.imageUrl }} style={styles.appNewsModalImage} resizeMode="cover" />
              ) : null}
              <Text style={[styles.appNewsModalTitle, { color: colors.foreground }]}>{appNewsDetail?.title}</Text>
              <Text style={[styles.appNewsModalBody, { color: colors.mutedForeground }]}>{appNewsDetail?.body}</Text>
              {appNewsDetail?.buttonText && appNewsDetail.targetType === "external_url" && appNewsDetail.targetValue ? (
                <Pressable
                  style={[styles.appNewsModalBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    const u = appNewsDetail.targetValue?.trim();
                    if (u) void WebBrowser.openBrowserAsync(u);
                  }}
                >
                  <Text style={styles.appNewsModalBtnText}>{appNewsDetail.buttonText}</Text>
                </Pressable>
              ) : null}
              {appNewsDetail?.buttonText && appNewsDetail.targetType === "internal_screen" && appNewsDetail.targetValue ? (
                <Pressable
                  style={[styles.appNewsModalBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    const p = appNewsDetail.targetValue?.trim();
                    if (p === "/sponsors") {
                      router.push(SPONSORS_DETAIL_ROUTE as Href);
                    } else if (p) {
                      router.push(p as Href);
                    }
                    setAppNewsDetail(null);
                  }}
                >
                  <Text style={styles.appNewsModalBtnText}>{appNewsDetail.buttonText}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.appNewsModalClose} onPress={() => setAppNewsDetail(null)}>
                <Text style={[styles.appNewsModalCloseText, { color: colors.primary }]}>Schließen</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── BOTTOM TAB BAR ── */}
      <BottomTabBar active="start" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />

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
                <View
                  style={[
                    styles.dotDestination,
                    { backgroundColor: isEditingOrigin || editingViaIndex !== null ? colors.border : colors.primary },
                  ]}
                />
              </View>

              {/* Felder rechts */}
              <View style={styles.fieldsCol}>
                {/* START-Feld */}
                <Pressable
                  style={[
                    styles.fieldWrap,
                    isEditingOrigin && editingViaIndex === null && { borderBottomColor: colors.primary },
                  ]}
                  onPress={() => { setIsEditingOrigin(true); setEditingViaIndex(null); }}
                >
                  <TextInput
                    ref={originInputRef}
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={originQuery}
                    onChangeText={handleOriginQueryChange}
                    placeholder="Startadresse eingeben..."
                    placeholderTextColor={colors.mutedForeground}
                    onFocus={() => { setIsEditingOrigin(true); setEditingViaIndex(null); }}
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

                {viaSearchLegs.map((leg, viaIdx) => (
                  <React.Fragment key={leg.id}>
                    <View style={[styles.fieldWrap, !isEditingOrigin && editingViaIndex === viaIdx && { borderBottomColor: colors.primary }]}>
                      <TextInput
                        ref={(r) => {
                          viaInputRefs.current[viaIdx] = r;
                        }}
                        style={[styles.fieldInput, { color: colors.foreground }]}
                        value={leg.query}
                        onChangeText={(t) => handleViaLegQueryChange(viaIdx, t)}
                        placeholder="Zwischenstopp eingeben…"
                        placeholderTextColor={colors.mutedForeground}
                        onFocus={() => {
                          setIsEditingOrigin(false);
                          setEditingViaIndex(viaIdx);
                        }}
                        returnKeyType="search"
                        autoCorrect={false}
                      />
                      {leg.isSearching && <ActivityIndicator size="small" color={colors.primary} />}
                      {leg.query.length > 0 && !leg.isSearching && (
                        <Pressable onPress={() => handleViaLegQueryChange(viaIdx, "")} hitSlop={8}>
                          <Feather name="x" size={16} color={colors.mutedForeground} />
                        </Pressable>
                      )}
                      <Pressable
                        hitSlop={10}
                        accessibilityLabel="Zwischenstopp entfernen"
                        onPress={() => removeViaSearchLeg(viaIdx)}
                        style={styles.searchWaypointPlusBtn}
                      >
                        <Feather name="minus" size={20} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                    <View style={[styles.fieldSeparator, { backgroundColor: colors.border }]} />
                  </React.Fragment>
                ))}

                {/* ZIEL-Feld */}
                <View
                  style={[
                    styles.fieldWrap,
                    !isEditingOrigin && editingViaIndex === null && { borderBottomColor: colors.primary },
                  ]}
                >
                  <TextInput
                    ref={destInputRef}
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    value={destQuery}
                    onChangeText={handleDestQueryChange}
                    placeholder="Ziel eingeben..."
                    placeholderTextColor={colors.mutedForeground}
                    onFocus={() => {
                      setIsEditingOrigin(false);
                      setEditingViaIndex(null);
                    }}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {isSearchingDest && <ActivityIndicator size="small" color={colors.primary} />}
                  {destQuery.length > 0 && !isSearchingDest && (
                    <Pressable onPress={() => { setDestQuery(""); setDestResults([]); }} hitSlop={8}>
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                  <Pressable
                    hitSlop={10}
                    accessibilityLabel="Zwischenstopp hinzufügen"
                    disabled={viaSearchLegs.length >= MAX_VIA_STOPS}
                    onPress={addViaSearchLeg}
                    style={[styles.searchWaypointPlusBtn, viaSearchLegs.length >= MAX_VIA_STOPS && { opacity: 0.35 }]}
                  >
                    <Feather name="plus" size={20} color={colors.primary} />
                  </Pressable>
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

              {showViaResults && editingViaIndex !== null && activeViaLeg && (
                <View style={[styles.resultGroup, { borderColor: colors.border }]}>
                  {activeViaLeg.isSearching && activeViaLeg.results.length === 0 ? (
                    <View style={styles.searchingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.searchingText, { color: colors.mutedForeground }]}>Suche läuft...</Text>
                    </View>
                  ) : (
                    activeViaLeg.results.map((loc, i) => (
                      <React.Fragment key={`${editingViaIndex}-${i}-${loc.displayName}`}>
                        {i > 0 && <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />}
                        <Pressable
                          style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]}
                          onPress={() => handleViaLegSelect(editingViaIndex, loc)}
                        >
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
                    ))
                  )}
                </View>
              )}

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
            <OnrodaOrMark size={56} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -1.2 }}>Onroda</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.70)", textAlign: "center", paddingHorizontal: 40 }}>
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
                size={isSmallScreen ? 52 : 62}
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
              <Text style={[styles.onboardingTagline, { color: colors.mutedForeground, fontSize: isSmallScreen ? 12 : 14 }]}>
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

      {/* ── Adresse bearbeiten Modal ── */}
      <Modal visible={!!editPreset} transparent animationType="fade" onRequestClose={() => setEditPreset(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setEditPreset(null)}>
            <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={styles.modalTitleRow}>
                <Feather name={editPreset === "home" ? "home" : "briefcase"} size={18} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.foreground, marginLeft: 8 }]}>
                  {editPreset === "home" ? "Wohnadresse" : "Arbeitsadresse"}
                </Text>
                <Pressable onPress={() => setEditPreset(null)} style={[styles.modalCloseBtn, { marginLeft: "auto" }]}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Eingabefeld */}
              <View style={[styles.editPresetInputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  autoFocus
                  placeholder="Adresse eingeben…"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.editPresetInput, { color: colors.foreground }]}
                  value={editPresetQuery}
                  onChangeText={setEditPresetQuery}
                  returnKeyType="search"
                />
                {editPresetLoading && <ActivityIndicator size="small" color={colors.primary} />}
                {editPresetQuery.length > 0 && !editPresetLoading && (
                  <Pressable hitSlop={8} onPress={() => { setEditPresetQuery(""); setEditPresetResults([]); }}>
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {/* Ergebnisliste */}
              {editPresetResults.length > 0 && (
                <ScrollView
                  style={{ maxHeight: 240 }}
                  keyboardShouldPersistTaps="always"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
                  {editPresetResults.map((loc, idx) => {
                    const isSelected = selectedEditResult?.displayName === loc.displayName;
                    return (
                      <Pressable
                        key={idx}
                        style={[
                          styles.editPresetResult,
                          { borderColor: colors.border },
                          isSelected && { backgroundColor: "#FEF2F2" },
                        ]}
                        onPress={() => setSelectedEditResult(loc)}
                      >
                        <Feather name="map-pin" size={14} color={isSelected ? colors.primary : colors.mutedForeground} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: isSelected ? colors.primary : colors.foreground }} numberOfLines={1}>
                            {loc.displayName.split(",")[0]}
                          </Text>
                          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }} numberOfLines={1}>
                            {loc.displayName.split(",").slice(1).join(",").trim()}
                          </Text>
                        </View>
                        {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* Speichern-Button */}
              <Pressable
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: selectedEditResult ? colors.success : colors.muted },
                ]}
                disabled={!selectedEditResult}
                onPress={() => {
                  if (!selectedEditResult || !editPreset) return;
                  savePreset(editPreset, selectedEditResult);
                  setEditPreset(null);
                  setEditPresetQuery("");
                  setEditPresetResults([]);
                  setSelectedEditResult(null);
                }}
              >
                <Feather name="check" size={16} color={selectedEditResult ? "#fff" : colors.mutedForeground} />
                <Text style={[styles.modalBtnPrimaryText, { color: selectedEditResult ? "#fff" : colors.mutedForeground }]}>
                  Speichern
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

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
                onPress={() => void runFavoriteAddressLookup()}
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
                    TREFFER ANTIPPEN
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

  cancelFab: {
    position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#DC2626", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5, zIndex: 10,
  },
  cancelFabText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  /* ── Bottom sheet ── */
  sheet: {
    position: "absolute", bottom: TAB_HEIGHT + 4, left: 0, right: 0,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 16, maxHeight: "76%",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 6, marginBottom: 2 },
  sheetScroll: { flexShrink: 1 },

  /* Route card (Option B – zwei Zeilen mit Trennlinie) */
  routeCard: {
    marginHorizontal: BOTTOM_TAB_BAR_OUTER_PADDING_X,
    marginTop: 8,
    marginBottom: 0,
    borderRadius: rs(22),
    borderWidth: 1,
    overflow: "hidden",
  },
  routeCardRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  routeCardDotOrigin: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "#999", borderWidth: 1.5, borderColor: "#555",
  },
  routeCardDotDest: { width: 9, height: 9, borderRadius: 5 },
  routeCardText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  routeCardSep: { height: 1, marginLeft: 14, marginRight: 14 },

  miniSearchPill: {
    marginHorizontal: BOTTOM_TAB_BAR_OUTER_PADDING_X,
    marginTop: rs(2),
    marginBottom: rs(8),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingLeft: rs(4),
    paddingRight: rs(8),
    paddingVertical: rs(7),
    borderRadius: rs(21),
    backgroundColor: onrodaTheme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#A0A0A5",
    shadowColor: onrodaTheme.colors.text,
    shadowOffset: { width: 0, height: rs(10) },
    shadowOpacity: 0.06,
    shadowRadius: rs(24),
    elevation: 4,
  },
  miniSearchPillMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    paddingVertical: rs(5),
    paddingLeft: rs(6),
    minWidth: 0,
  },
  miniGpsBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: "center",
    justifyContent: "center",
  },
  miniSearchIconCircle: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    justifyContent: "center",
    alignItems: "center",
  },
  miniSearchPlaceholderText: {
    flex: 1,
    fontSize: rf(15),
    lineHeight: rf(20),
    fontFamily: "Inter_400Regular",
    color: HOME_SHEET_MUTED,
  },
  miniActionRow: {
    flexDirection: "row",
    gap: rs(8),
    marginHorizontal: BOTTOM_TAB_BAR_OUTER_PADDING_X,
    marginBottom: rs(10),
    alignItems: "center",
  },
  miniBtnHalf: { flex: 1, minWidth: 0 },
  miniBtnSheetWhite: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(7),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderRadius: rs(999),
    backgroundColor: HOME_SHEET_PANEL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_SHEET_RIM,
  },
  miniBtnSheetWhiteText: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    color: HOME_SHEET_TEXT,
    flexShrink: 1,
  },
  miniBtnSheetMedical: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(7),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderRadius: rs(999),
    backgroundColor: HOME_MEDICAL_SOFT_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_MEDICAL_GREEN,
  },
  miniBtnSheetMedicalText: {
    fontSize: rf(14),
    fontFamily: "Inter_600SemiBold",
    color: HOME_MEDICAL_GREEN_DARK,
    flexShrink: 1,
  },
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
  /** Nur Home-Sheet „Reservieren“: kompakter als übrige Primary-Buttons. */
  miniBtnPrimaryRedCompact: {
    paddingVertical: rs(10),
    gap: rs(6),
  },
  miniBtnPrimaryRedTextCompact: {
    fontSize: rf(14),
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
    paddingVertical: rs(12),
    paddingHorizontal: rs(8),
    borderRadius: rs(999),
    backgroundColor: HOME_MEDICAL_SOFT_BG,
    borderWidth: 2,
    borderColor: HOME_MEDICAL_GREEN,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(1) },
    shadowOpacity: 0.05,
    shadowRadius: rs(3),
    elevation: 2,
  },
  miniBtnMedicalOutlineText: {
    fontSize: rf(16),
    fontFamily: "Inter_700Bold",
    color: HOME_MEDICAL_GREEN_DARK,
    flexShrink: 1,
  },
  /** Nur Home-Sheet „Krankenfahrt“: kompakter. */
  miniBtnMedicalOutlineCompact: {
    paddingVertical: rs(9),
    paddingHorizontal: rs(6),
    gap: rs(6),
  },
  miniBtnMedicalOutlineTextCompact: {
    fontSize: rf(14),
  },
  homeQuickSectionHeading: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
    paddingHorizontal: rs(14),
  },
  homeQuickSection: {
    marginHorizontal: rs(14),
    marginTop: rs(10),
    marginBottom: rs(8),
    paddingTop: rs(10),
    paddingBottom: rs(8),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: HOME_SHEET_PANEL,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(2) },
    shadowOpacity: 0.12,
    shadowRadius: rs(6),
    elevation: 4,
  },
  homeQuickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
  },
  homeQuickIconWrap: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(8),
    justifyContent: "center",
    alignItems: "center",
  },
  homeQuickTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  homeQuickSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 1 },
  homeQuickDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: rs(56),
    marginRight: rs(12),
  },
  favFormInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  favFormRow: { flexDirection: "row", gap: 10 },
  favFormInputHalf: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  favReorderCol: { alignItems: "center", justifyContent: "center", gap: 2, marginRight: 4 },

  quickTextWrap: { flex: 1 },

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

  /* Fare panel */
  fareSection: { padding: 14, gap: 12, paddingBottom: 22 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 16 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  routeStrip: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 18 },
  routeStripItem: { flex: 1, alignItems: "center", gap: 4 },
  fareHighlight: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginHorizontal: 8, marginVertical: 4, backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  routeStripDistance: { fontSize: 16, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  routeStripLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  routeStripDivider: { width: 1, height: 32 },
  routeStripDividerShort: { height: 22, alignSelf: "center" },
  panelLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -6 },
  stickyBookRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  stickyBookCol: { flex: 1, gap: 8 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, gap: 6 },
  bookBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.15 },
  bookBtnHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },
  searchClearBtn: { padding: 2, marginLeft: 4 },
  searchClearCircle: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },

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
    borderRadius: 16, borderWidth: 1.5,
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
  fieldSeparator: { height: 2, marginLeft: 8, marginRight: 8, opacity: 0.45 },
  gpsIconBtn: { padding: 4 },
  searchWaypointPlusBtn: { padding: 4, marginLeft: 2, justifyContent: "center", alignItems: "center" },

  /* Results list */
  resultsContent: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -4 },
  resultGroup: { borderRadius: 14, borderWidth: 1.5, overflow: "hidden" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
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
  editPresetInputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  editPresetInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  editPresetResult: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalBtnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 14, borderWidth: 1.5 },
  modalBtnSecondaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 14, paddingVertical: 16, borderRadius: 14, borderWidth: 1,
  },
  socialBtnText: { fontSize: 17, fontFamily: "Inter_500Medium" },

  /* ── ONBOARDING ── */
  onboardingBranding: {
    alignItems: "center", gap: 6, marginBottom: 8,
  },
  onboardingTitle: {
    fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -1.2,
  },
  onboardingTagline: {
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  onboardingBlock: {
    borderRadius: 20, borderWidth: 1, padding: 20, gap: 14,
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

  appNewsHeading: {
    fontSize: rf(13),
    fontFamily: "Inter_600SemiBold",
    color: HOME_SHEET_MUTED,
    marginBottom: rs(8),
    letterSpacing: 0.4,
  },
  appNewsSlideCard: {
    borderRadius: rs(16),
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  appNewsSlideImage: { width: "100%", height: rs(112), backgroundColor: SPONSOR_NEWS_CARD_WHITE },
  appNewsSlideImagePlaceholder: { backgroundColor: SPONSOR_NEWS_CARD_WHITE },
  appNewsSlideBody: { padding: rs(14) },
  appNewsSlideTitle: { fontSize: rf(16), fontFamily: "Inter_700Bold", marginBottom: rs(6) },
  appNewsSlideBodyText: { fontSize: rf(14), fontFamily: "Inter_400Regular", lineHeight: rf(20) },
  appNewsSlideCta: {
    alignSelf: "flex-start",
    marginTop: rs(10),
    paddingVertical: rs(8),
    paddingHorizontal: rs(14),
    borderRadius: rs(999),
  },
  appNewsSlideCtaText: { color: "#fff", fontSize: rf(13), fontFamily: "Inter_600SemiBold" },
  appNewsDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: rs(6),
    marginTop: rs(4),
    paddingHorizontal: rs(20),
  },
  appNewsDot: {
    width: rs(6),
    height: rs(6),
    borderRadius: rs(3),
  },
  appNewsModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  appNewsModalCard: {
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    padding: rs(20),
    maxHeight: "88%",
  },
  appNewsModalImage: { width: "100%", height: rs(180), borderRadius: rs(12), marginBottom: rs(12) },
  appNewsModalTitle: { fontSize: rf(20), fontFamily: "Inter_700Bold", marginBottom: rs(8) },
  appNewsModalBody: { fontSize: rf(15), fontFamily: "Inter_400Regular", lineHeight: rf(22), marginBottom: rs(16) },
  appNewsModalBtn: {
    alignSelf: "flex-start",
    paddingVertical: rs(12),
    paddingHorizontal: rs(18),
    borderRadius: rs(12),
    marginBottom: rs(12),
  },
  appNewsModalBtnText: { color: "#fff", fontSize: rf(15), fontFamily: "Inter_600SemiBold" },
  appNewsModalClose: { paddingVertical: rs(8), alignItems: "center" },
  appNewsModalCloseText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold" },
  sponsorTeaserCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sponsorTeaserEyebrow: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  sponsorTeaserTitle: { fontSize: rf(15), fontFamily: "Inter_700Bold", marginBottom: 2 },
  sponsorTeaserText: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(18) },
});
