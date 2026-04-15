import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import { type VehicleType, VEHICLES, useRide } from "@/context/RideContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { FahrerRegistrierenFooter, NeuBeiOnrodaRegisterRow } from "@/src/screens/LoginScreen";
import { formatEuro } from "@/utils/fareCalculator";
import { type GeoLocation, searchLocation } from "@/utils/routing";
import { getApiBaseUrl } from "@/utils/apiBase";
import { getGoogleOAuthRedirectUri } from "@/utils/googleOAuthReturnUrl";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";
import { readOAuthReturnParams } from "@/utils/readOAuthReturnParams";
import { rs, rf } from "@/utils/scale";

WebBrowser.maybeCompleteAuthSession();

const API_URL = getApiBaseUrl();

/** Platzhalter bis SMS über Backend (z. B. Twilio) oder Firebase Phone Auth angebunden ist. */
const DEV_SMS_CODE = process.env.EXPO_PUBLIC_DEV_SMS_CODE ?? "123456";

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

const FIXPREIS_VOUCHER_HINT = "Fixpreis ist bei Transportschein nicht verfügbar";
const SEARCH_OVERLAY_BG = "#FFFFFF";

const VEHICLE_CAR_ICON = "#171717";

const VEHICLE_ICON_CONFIG: Record<string, { icon: string; color: string; bg: string; seats: string }> = {
  standard: { icon: "car-side", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "4 Personen" },
  xl: { icon: "van-passenger", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "bis zu 6 Personen" },
  wheelchair: { icon: "wheelchair-accessibility", color: "#0369A1", bg: "#E0F2FE", seats: "Rollstuhlgerecht" },
  onroda: { icon: "car-side", color: VEHICLE_CAR_ICON, bg: "#F3F4F6", seats: "Fixpreis-Garantie" },
};

const VEHICLE_LONG_COPY: Record<VehicleType, string[]> = {
  onroda: [
    "Festpreis wird vor der Buchung angezeigt und bleibt während der Fahrt unverändert.",
    "Ideal, wenn du den Endpreis vorab kennen möchtest.",
  ],
  standard: [
    "Klassisches Taxi für den Alltag – bis zu 4 Personen.",
    "Der angezeigte Betrag ist ein Schätzpreis (Taxameter).",
  ],
  xl: [
    "Mehr Platz für Gruppen und Gepäck – bis zu 6 Personen.",
    "Höherer Tariffaktor gegenüber dem Standard-Fahrzeug.",
  ],
  wheelchair: [
    "Fahrzeug mit rollstuhlgerechter Ausstattung.",
    "Bitte wählen, wenn du eine barrierefreie Beförderung brauchst.",
  ],
};

/** Beige-Slider: zweizeilige Headline wie Marketing-Karte */
const VEHICLE_HEADLINES: Record<VehicleType, { line1: string; line2: string }> = {
  onroda: { line1: "Festpreis sicher?", line2: "Verlass dich auf uns" },
  standard: { line1: "Taxi gebucht?", line2: "Dein Standard-Wagen" },
  xl: { line1: "Mehr Platz nötig?", line2: "Bis zu 6 Personen" },
  wheelchair: { line1: "Barrierefrei unterwegs?", line2: "Wir sind für dich da" },
};

/** Karussell inkl. Info-Karte Krankenfahrten (kein Fahrzeugtyp). */
type HomeBannerSlideId = VehicleType | "krankenfahrten";

const HOME_SLIDER_ORDER: HomeBannerSlideId[] = [
  "onroda",
  "standard",
  "xl",
  "krankenfahrten",
  "wheelchair",
];

const KRANKENFAHRTEN_LONG_COPY = [
  "Organisiere deine Krankenfahrt mit Verordnung – zuverlässig und termintreu.",
  "Unterlagen und Krankenschein bitte zur Fahrt bereithalten. Bei Rückfragen erreichst du uns über Hilfe & Support.",
];

function getBannerHeadlines(id: HomeBannerSlideId): { line1: string; line2: string } {
  if (id === "krankenfahrten") {
    return { line1: "Krankenfahrten buchen", line2: "Ärztlich verordnete Fahrten" };
  }
  return VEHICLE_HEADLINES[id];
}

function getBannerMeta(id: HomeBannerSlideId): string {
  if (id === "krankenfahrten") return "Krankenfahrten · Mit ärztlicher Verordnung";
  const v = VEHICLES.find((x) => x.id === id)!;
  const cfg = VEHICLE_ICON_CONFIG[id];
  return `${v.name} · ${cfg.seats}`;
}

function getBannerLongCopy(id: HomeBannerSlideId): string[] {
  if (id === "krankenfahrten") return KRANKENFAHRTEN_LONG_COPY;
  return VEHICLE_LONG_COPY[id];
}

const SLIDER_BEIGE = "#EDE4D3";
const SLIDER_BEIGE_DEEP = "#E8DCC8";
const SLIDER_CARD_GAP = 10;

type VehicleSliderColors = {
  foreground: string;
  mutedForeground: string;
  primary: string;
};

function BannerTrustIllustration({ slideId }: { slideId: HomeBannerSlideId }) {
  if (slideId === "krankenfahrten") {
    return (
      <View style={styles.vehicleRefIllu}>
        <MaterialCommunityIcons name="hexagon" size={72} color="#DC2626" style={styles.vehicleRefHex} />
        <View style={styles.vehicleRefShield}>
          <MaterialCommunityIcons name="medical-bag" size={40} color="#FFFFFF" />
        </View>
      </View>
    );
  }
  const accent = slideId === "wheelchair" ? "#0369A1" : ONRODA_MARK_RED;
  return (
    <View style={styles.vehicleRefIllu}>
      <MaterialCommunityIcons name="hexagon" size={72} color={accent} style={styles.vehicleRefHex} />
      <View style={styles.vehicleRefShield}>
        <MaterialCommunityIcons name="shield" size={42} color="#FFFFFF" />
        <MaterialCommunityIcons name="check-bold" size={21} color="#1F2937" style={styles.vehicleRefCheck} />
      </View>
    </View>
  );
}

function HorizontalVehicleSlider({
  colors,
  viewportWidth,
  selectedVehicle,
  expandedBannerId,
  onSlideSnap,
  onMehrErfahren,
}: {
  colors: VehicleSliderColors;
  viewportWidth: number;
  selectedVehicle: VehicleType | null;
  expandedBannerId: HomeBannerSlideId | null;
  onSlideSnap: (id: HomeBannerSlideId) => void;
  onMehrErfahren: (id: HomeBannerSlideId) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const programmaticScrollRef = useRef(false);
  const slideW = Math.min(268, Math.max(220, viewportWidth - 36));
  const step = slideW + SLIDER_CARD_GAP;
  const nSlides = HOME_SLIDER_ORDER.length;
  const [dotIndex, setDotIndex] = useState(0);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      const clamped = Math.max(0, Math.min(nSlides - 1, index));
      scrollRef.current?.scrollTo({ x: clamped * step, animated });
    },
    [step, nSlides],
  );

  useEffect(() => {
    const endProgrammaticSoon = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      });
    };
    if (selectedVehicle == null) {
      setDotIndex(0);
      programmaticScrollRef.current = true;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      endProgrammaticSoon();
      return;
    }
    const idx = HOME_SLIDER_ORDER.indexOf(selectedVehicle);
    if (idx < 0) return;
    setDotIndex(idx);
    programmaticScrollRef.current = true;
    scrollToIndex(idx, false);
    endProgrammaticSoon();
  }, [selectedVehicle, scrollToIndex]);

  const onScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (programmaticScrollRef.current) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / step);
    const clamped = Math.max(0, Math.min(nSlides - 1, idx));
    setDotIndex(clamped);
    const id = HOME_SLIDER_ORDER[clamped];
    if (id) onSlideSnap(id);
  };

  return (
    <View style={styles.vehicleSliderWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={[styles.vehicleSliderSnapContent, { paddingLeft: 0, paddingRight: 16 }]}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
      >
        {HOME_SLIDER_ORDER.map((slideId, i) => {
          const expanded = expandedBannerId === slideId;
          const snapFocused = dotIndex === i;
          const headlines = getBannerHeadlines(slideId);
          const metaLine = getBannerMeta(slideId);
          const longCopy = getBannerLongCopy(slideId);
          const borderW = expanded ? 2.5 : snapFocused ? 2 : 0;
          const borderColor = expanded ? ONRODA_MARK_RED : snapFocused ? colors.primary : "transparent";
          return (
            <View
              key={slideId}
              style={[
                styles.vehicleRefCard,
                {
                  width: slideW,
                  marginRight: i < nSlides - 1 ? SLIDER_CARD_GAP : 0,
                  backgroundColor: SLIDER_BEIGE,
                  borderWidth: borderW,
                  borderColor,
                  shadowOpacity: expanded ? 0.16 : snapFocused ? 0.1 : 0.06,
                  shadowRadius: expanded ? 16 : 10,
                  elevation: expanded ? 10 : snapFocused ? 5 : 3,
                },
              ]}
            >
              <View style={styles.vehicleRefCardInner}>
                <View style={styles.vehicleRefLeft}>
                  <Text style={[styles.vehicleRefLine1, { color: colors.foreground }]} numberOfLines={2}>
                    {headlines.line1}
                  </Text>
                  <Text style={[styles.vehicleRefLine2, { color: colors.foreground }]} numberOfLines={2}>
                    {headlines.line2}
                  </Text>
                  <Text style={[styles.vehicleRefMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {metaLine}
                  </Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.vehicleRefCta,
                      { opacity: pressed ? 0.92 : 1, backgroundColor: ONRODA_MARK_RED },
                    ]}
                    onPress={() => onMehrErfahren(slideId)}
                  >
                    <Text style={styles.vehicleRefCtaText}>Mehr erfahren</Text>
                  </Pressable>
                </View>
                <BannerTrustIllustration slideId={slideId} />
              </View>
              {expanded && (
                <View style={[styles.vehicleSliderExpand, { borderTopColor: SLIDER_BEIGE_DEEP }]}>
                  {longCopy.map((line, j) => (
                    <Text
                      key={j}
                      style={[
                        styles.vehicleSliderExpandLine,
                        { color: colors.mutedForeground },
                        j < longCopy.length - 1 && { marginBottom: 10 },
                      ]}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.vehicleSliderDots}>
        {HOME_SLIDER_ORDER.map((slideId, i) => (
          <View
            key={slideId}
            style={[
              styles.vehicleSliderDot,
              i === dotIndex
                ? [styles.vehicleSliderDotActive, { backgroundColor: ONRODA_MARK_RED }]
                : { backgroundColor: colors.mutedForeground, opacity: 0.28 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ServiceBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#FDE68A" }}>
      <MaterialCommunityIcons name={icon as any} size={13} color="#92400E" />
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#92400E" }}>{label}</Text>
    </View>
  );
}

interface PresetLocation {
  id: string;
  title: string;
  subtitle: string;
  icon: "airplane" | "train";
  location: GeoLocation;
}

const PRESET_DESTINATIONS: PresetLocation[] = [
  {
    id: "airport-t12",
    title: "Abflug Terminal 1–2",
    subtitle: "Flughafen Stuttgart",
    icon: "airplane",
    location: { lat: 48.6900, lon: 9.2205, displayName: "Flughafen Stuttgart Terminal 1-2", city: "Stuttgart" },
  },
  {
    id: "airport-t34",
    title: "Abflug Terminal 3–4",
    subtitle: "Flughafen Stuttgart",
    icon: "airplane",
    location: { lat: 48.6892, lon: 9.2222, displayName: "Flughafen Stuttgart Terminal 3-4", city: "Stuttgart" },
  },
  {
    id: "hbf-stuttgart",
    title: "Hauptbahnhof Stuttgart",
    subtitle: "Arnulf-Klett-Platz 2, Stuttgart",
    icon: "train",
    location: { lat: 48.7842, lon: 9.1826, displayName: "Hauptbahnhof Stuttgart", city: "Stuttgart" },
  },
];

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

const TAB_HEIGHT = 56;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const vehicleSliderViewportHome = screenWidth - 32;
  const homeBannerSliderColors = useMemo(
    (): VehicleSliderColors => ({
      foreground: colors.foreground,
      mutedForeground: colors.mutedForeground,
      primary: colors.primary,
    }),
    [colors.foreground, colors.mutedForeground, colors.primary],
  );
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
    setOrigin, setDestination, setSelectedVehicle, setPaymentMethod,
    setScheduledTime, fetchRoute, resetRide, history,
  } = useRide();

  const { myActiveRequests } = useRideRequests();
  const ridesBadge = myActiveRequests.length;

  /* ── Onboarding: shown whenever neither customer nor driver is logged in ── */
  const showOnboarding = !driverLoading && !profile.isLoggedIn && !isDriverLoggedIn;

  type OnboardingCustomerStep = "social" | "register" | "verify";
  const [onboardingCustomerStep, setOnboardingCustomerStep] = useState<OnboardingCustomerStep>("social");
  const [obRegName, setObRegName] = useState("");
  const [obRegEmail, setObRegEmail] = useState("");
  const [obRegPhone, setObRegPhone] = useState("");
  const [obRegSms, setObRegSms] = useState("");

  useEffect(() => {
    if (!showOnboarding) {
      setOnboardingCustomerStep("social");
      setObRegName("");
      setObRegEmail("");
      setObRegPhone("");
      setObRegSms("");
    }
  }, [showOnboarding]);

  /* ── After driver login, navigate to dashboard ── */
  useEffect(() => {
    if (isDriverLoggedIn) {
      router.replace(driverProfile?.mustChangePassword ? "/driver/change-password" : "/driver/dashboard");
    }
  }, [isDriverLoggedIn, driverProfile?.mustChangePassword]);

  /* ── Search overlay state ── */
  const [isSearchActive, setIsSearchActive] = useState(false);

  /* ── Auto-open search when navigated with ?search=1 ── */
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (searchParam === "1") {
      setIsSearchActive(true);
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

  /* ── Saved home / work ── */
  const [savedHome, setSavedHome] = useState<GeoLocation | null>(null);
  const [savedWork, setSavedWork] = useState<GeoLocation | null>(null);
  const [savingPreset, setSavingPreset] = useState<"home" | "work" | null>(null);
  const [expandedBannerId, setExpandedBannerId] = useState<HomeBannerSlideId | null>(null);
  const [comboHint, setComboHint] = useState<string | null>(null);
  const comboHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Auf der Karte mit Ziel: Sofort vs. Termin — gleicher Einstieg wie `reserve-ride`. */
  const [bookingMode, setBookingMode] = useState<"immediate" | "scheduled">("immediate");
  const showComboHint = useCallback((msg: string) => {
    if (comboHintTimerRef.current) clearTimeout(comboHintTimerRef.current);
    setComboHint(msg);
    comboHintTimerRef.current = setTimeout(() => setComboHint(null), 4200);
  }, []);

  /* ── Edit-Preset Modal ── */
  const [editPreset, setEditPreset] = useState<"home" | "work" | null>(null);
  const [editPresetQuery, setEditPresetQuery] = useState("");
  const [editPresetResults, setEditPresetResults] = useState<GeoLocation[]>([]);
  const [editPresetLoading, setEditPresetLoading] = useState(false);
  const [selectedEditResult, setSelectedEditResult] = useState<GeoLocation | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("@Onroda_home").then((r) => { if (r) setSavedHome(JSON.parse(r)); }).catch(() => {});
    AsyncStorage.getItem("@Onroda_work").then((r) => { if (r) setSavedWork(JSON.parse(r)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const savePreset = (type: "home" | "work", loc: GeoLocation) => {
    if (type === "home") {
      setSavedHome(loc);
      AsyncStorage.setItem("@Onroda_home", JSON.stringify(loc)).catch(() => {});
    } else {
      setSavedWork(loc);
      AsyncStorage.setItem("@Onroda_work", JSON.stringify(loc)).catch(() => {});
    }
    setSavingPreset(null);
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
  const [mapCenterKey, setMapCenterKey] = useState(0);
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

  const handleOnboardingRequestSms = useCallback(() => {
    const name = obRegName.trim();
    const email = obRegEmail.trim();
    const phone = obRegPhone.trim();
    if (!name || !phone || !isPlausibleEmail(email)) {
      Alert.alert("Hinweis", "Bitte gültigen Namen, E-Mail und Telefonnummer eingeben.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setObRegSms("");
    setOnboardingCustomerStep("verify");
  }, [obRegName, obRegEmail, obRegPhone]);

  const handleOnboardingCompleteRegister = useCallback(() => {
    if (obRegSms.trim() !== DEV_SMS_CODE) {
      Alert.alert("Falscher Code", "Der eingegebene Code ist ungültig.");
      return;
    }
    registerLocalCustomer({
      name: obRegName.trim(),
      email: obRegEmail.trim(),
      phone: obRegPhone.trim(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [obRegSms, obRegName, obRegEmail, obRegPhone, registerLocalCustomer]);

  /* ── Route fetch: nach Ziel- und Fahrzeugwahl Preis live neu berechnen ── */
  useEffect(() => {
    if (destination) void fetchRoute();
  }, [destination, fetchRoute]);

  useEffect(() => {
    if (destination && !selectedVehicle) {
      setSelectedVehicle("onroda");
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

  useEffect(() => {
    if (destination) setExpandedBannerId(null);
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

  const handleDestinationSelect = (loc: GeoLocation) => {
    if (savingPreset) {
      savePreset(savingPreset, loc);
      return;
    }
    setDestination(loc);
    setDestQuery("");
    setDestResults([]);
    setIsSearchActive(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setSavingPreset(null);
    setDestQuery("");
    setDestResults([]);
    setOriginQuery("");
    setOriginResults([]);
    setIsEditingOrigin(false);
  };

  const handleVehicleSlideSnap = useCallback(
    (id: HomeBannerSlideId) => {
      Haptics.selectionAsync();
      if (id === "krankenfahrten") return;
      if (id === "onroda" && paymentMethod === "voucher") {
        setPaymentMethod(null);
        showComboHint(FIXPREIS_VOUCHER_HINT);
      }
      setSelectedVehicle(id);
    },
    [paymentMethod, setPaymentMethod, setSelectedVehicle, showComboHint],
  );

  const handleVehicleMehrErfahren = useCallback(
    (id: HomeBannerSlideId) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (id !== "krankenfahrten") {
        if (id === "onroda" && paymentMethod === "voucher") {
          setPaymentMethod(null);
          showComboHint(FIXPREIS_VOUCHER_HINT);
        }
        setSelectedVehicle(id);
      }
      setExpandedBannerId((prev) => (prev === id ? null : id));
    },
    [paymentMethod, setPaymentMethod, setSelectedVehicle, showComboHint],
  );


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
    router.push("/ride");
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
      if (!silent) setMapCenterKey(k => k + 1);
      if (isSearchActive) setOriginQuery(geoLoc.displayName.split(",")[0]);
      if (!silent) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    finally { setGpsLoading(false); }
  };

  useEffect(() => { handleGpsLocate(true); }, []);

  const recentDest = history[0];

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
    return <Redirect href={driverProfile?.mustChangePassword ? "/driver/change-password" : "/driver/dashboard"} />;
  }
  if (isDriverLoggedIn && !isHomeFocused) {
    return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;
  }

  /* ── Results to show in overlay ── */
  const showOriginResults = isEditingOrigin && (originResults.length > 0 || isSearchingOrigin);
  const showDestResults = !isEditingOrigin && destResults.length > 0;
  const showPresets = !isEditingOrigin && destResults.length === 0 && !isSearchingDest;

  /** Karte: Platz für Chip/FAB oben und Sheet unten – nicht zu extrem zoomen (Standortpunkt sichtbar). */
  const mapEdgePaddingTop = Math.round(!destination ? topPad + 8 + 70 : topPad + 12 + 46);
  const mapEdgePaddingBottom = Math.round(
    destination
      ? Math.min(380, Math.max(260, screenHeight * 0.32 + TAB_HEIGHT))
      : Math.min(460, TAB_HEIGHT + screenHeight * 0.4),
  );

  return (
    <View style={styles.root}>
      {/* ── FULL-SCREEN MAP ── */}
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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
      )}

      {profile.isLoggedIn ? (<>

      {/* ── ORIGIN CHIP (overlaid on map) — nur ohne Ziel sichtbar ── */}
      {!destination && (
        <View style={[styles.originChip, { top: topPad + 8 }]}>
          <View style={styles.originChipRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.originChipLabel}>Start</Text>
              <Text style={styles.originChipText} numberOfLines={1}>
                {origin.displayName.split(",").slice(0, 2).join(",")}
              </Text>
            </View>
            {gpsLoading
              ? <ActivityIndicator size="small" color="#DC2626" />
              : (
                <Pressable style={styles.originLocBtn} onPress={() => { handleGpsLocate(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                  <Feather name="map-pin" size={rs(13)} color="#fff" />
                </Pressable>
              )}
          </View>
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
      <View style={[styles.sheet, { backgroundColor: colors.surface, maxHeight: destination ? "90%" : "84%" }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

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
          /* ── Einzelne Such-Pille ── */
          <View style={styles.searchRow}>
            <Pressable
              style={[styles.searchPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsSearchActive(true); }}
            >
              <View style={[styles.searchIconCircle, { backgroundColor: colors.primary }]}>
                <Feather name="search" size={13} color="#fff" />
              </View>
              <Text style={[styles.searchPlaceholderText, { color: "#888" }]} numberOfLines={1}>
                Wohin soll's gehen?
              </Text>
            </Pressable>
            <Pressable
              style={[styles.spaeterBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setScheduledTime(null);
                router.push("/reserve-ride");
              }}
            >
              <Feather name="calendar" size={14} color={colors.foreground} />
              <Text style={[styles.spaeterText, { color: colors.foreground }]}>Fahrt buchen</Text>
            </Pressable>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.sheetScroll}>
          {!destination ? (
            <>
              {/* Quick destinations */}
              <View style={[styles.quickSection, { borderColor: colors.border }]}>
                <Pressable
                  style={styles.quickRow}
                  onPress={() => {
                    if (savedHome) { setDestination(savedHome); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
                    else { setSavingPreset("home"); setIsSearchActive(true); }
                  }}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: savedHome ? "#FEF2F2" : colors.muted }]}>
                    <Feather name="home" size={16} color={savedHome ? colors.primary : colors.foreground} />
                  </View>
                  <View style={styles.quickTextWrap}>
                    <Text style={[styles.quickTitle, { color: colors.foreground }]}>Zuhause</Text>
                    <Text style={[styles.quickSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {savedHome ? savedHome.displayName.split(",")[0] : "Wohnadresse speichern"}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={12}
                    onPress={(e) => { e.stopPropagation(); setEditPreset("home"); setEditPresetQuery(""); setEditPresetResults([]); setSelectedEditResult(null); }}
                  >
                    <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
                <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={styles.quickRow}
                  onPress={() => {
                    if (savedWork) { setDestination(savedWork); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
                    else { setSavingPreset("work"); setIsSearchActive(true); }
                  }}
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: savedWork ? "#FEF2F2" : colors.muted }]}>
                    <Feather name="briefcase" size={16} color={savedWork ? colors.primary : colors.foreground} />
                  </View>
                  <View style={styles.quickTextWrap}>
                    <Text style={[styles.quickTitle, { color: colors.foreground }]}>Arbeit</Text>
                    <Text style={[styles.quickSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {savedWork ? savedWork.displayName.split(",")[0] : "Arbeitsadresse speichern"}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={12}
                    onPress={(e) => { e.stopPropagation(); setEditPreset("work"); setEditPresetQuery(""); setEditPresetResults([]); setSelectedEditResult(null); }}
                  >
                    <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
                {recentDest && (
                  <>
                    <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
                    <Pressable style={styles.quickRow} onPress={() => setIsSearchActive(true)}>
                      <View style={[styles.quickIconWrap, { backgroundColor: colors.muted }]}>
                        <Ionicons name="time-outline" size={16} color={colors.foreground} />
                      </View>
                      <View style={styles.quickTextWrap}>
                        <Text style={[styles.quickTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {recentDest.destination.split(",")[0]}
                        </Text>
                        <Text style={[styles.quickSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {recentDest.destination.split(",").slice(1, 3).join(",").trim() || recentDest.origin.split(",")[0]}
                        </Text>
                      </View>
                    </Pressable>
                  </>
                )}
              </View>

              <View style={styles.vehicleSection}>
                <HorizontalVehicleSlider
                  colors={homeBannerSliderColors}
                  viewportWidth={vehicleSliderViewportHome}
                  selectedVehicle={selectedVehicle}
                  expandedBannerId={expandedBannerId}
                  onSlideSnap={handleVehicleSlideSnap}
                  onMehrErfahren={handleVehicleMehrErfahren}
                />
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
                          size={22}
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

        {destination && !isLoadingRoute && !routeError && route && (
          <View style={[styles.stickyBookRow, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 18 + bottomPad + 12 }]}>
            <View style={styles.stickyBookCol}>
              <Pressable
                style={[
                  styles.bookBtn,
                  {
                    backgroundColor: "#16A34A",
                    borderWidth: 2,
                    borderColor: "#BBF7D0",
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

      {/* ── BOTTOM TAB BAR ── */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        {[
          { icon: "home" as const, label: "Start", active: true, badge: 0, onPress: () => {} },
          { icon: "calendar" as const, label: "Fahrten", active: false, badge: ridesBadge, onPress: () => router.replace("/my-rides") },
          { icon: "credit-card" as const, label: "Geldbörse", active: false, badge: 0, onPress: () => router.replace("/wallet") },
          { icon: "user" as const, label: "Account", active: false, badge: 0, onPress: () => router.replace("/profile") },
        ].map((tab) => (
          <Pressable key={tab.label} style={styles.tabItem} onPress={tab.onPress}>
            <View style={[styles.tabIconWrap, { backgroundColor: tab.active ? colors.primary : colors.muted }]}>
              <Feather name={tab.icon} size={13} color={tab.active ? "#fff" : "#111111"} />
              {tab.badge > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, { color: tab.active ? colors.primary : "#111111" }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

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

              {savingPreset ? (
                <View style={[styles.saveModeBanner, { backgroundColor: colors.primary + "14" }]}>
                  <Feather name={savingPreset === "home" ? "home" : "briefcase"} size={13} color={colors.primary} />
                  <Text style={[styles.saveModeBannerText, { color: colors.primary }]}>
                    {savingPreset === "home" ? "Wohnadresse speichern" : "Arbeitsadresse speichern"}
                  </Text>
                </View>
              ) : <View style={{ flex: 1 }} />}

              <Pressable style={styles.cancelBtn} onPress={closeSearch}>
                <Text style={[styles.cancelBtnText, { color: colors.primary }]}>Abbrechen</Text>
              </Pressable>
            </View>

            {scheduledTime && !savingPreset && (
              <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#B45309" }} numberOfLines={1}>
                  Vorbestellung · {scheduledTime.getHours().toString().padStart(2, "0")}:{scheduledTime.getMinutes().toString().padStart(2, "0")} Uhr
                </Text>
              </View>
            )}

            {/* Start → Ziel Card */}
            {selectedVehicle === "onroda" && fareBreakdown?.fareKind === "onroda_fix" && (
              <View style={styles.searchFixpreisBanner}>
                <MaterialCommunityIcons name="tag-outline" size={17} color={ONRODA_MARK_RED} />
                <Text style={styles.searchFixpreisBannerText}>
                  Garantierter Festpreis für diese Route: {formatEuro(fareBreakdown.total)}
                </Text>
              </View>
            )}

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

              {/* Preset-Vorschläge (sofort sichtbar) */}
              {showPresets && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BELIEBTE ZIELE</Text>
                  <View style={[styles.resultGroup, { borderColor: colors.border }]}>
                    {PRESET_DESTINATIONS.map((preset, i) => (
                      <React.Fragment key={preset.id}>
                        {i > 0 && <View style={[styles.resultDivider, { backgroundColor: colors.border }]} />}
                        <Pressable
                          style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.muted }]}
                          onPress={() => handleDestinationSelect(preset.location)}
                        >
                          <View style={[styles.resultIcon, {
                            backgroundColor: preset.icon === "airplane" ? "#EFF6FF" : "#F0FDF4",
                          }]}>
                            {preset.icon === "airplane"
                              ? <Ionicons name="airplane" size={15} color="#3B82F6" />
                              : <Ionicons name="train" size={15} color="#22C55E" />}
                          </View>
                          <View style={styles.resultText}>
                            <Text style={[styles.resultTitle, { color: colors.foreground }]}>{preset.title}</Text>
                            <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>{preset.subtitle}</Text>
                          </View>
                          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                        </Pressable>
                      </React.Fragment>
                    ))}
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
                      setObRegSms("");
                      setOnboardingCustomerStep("register");
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
                      router.push("/driver/login");
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
              {onboardingCustomerStep === "register" ? (
                <>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                    onPress={() => setOnboardingCustomerStep("social")}
                  >
                    <Feather name="arrow-left" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Konto erstellen</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -6 }}>
                    Mit E-Mail und SMS-Code (Testphase). Anschließend kannst du Fahrten buchen.
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
                    <Feather name="mail" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground }]}
                      placeholder="E-Mail"
                      placeholderTextColor={colors.mutedForeground}
                      value={obRegEmail}
                      onChangeText={setObRegEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="phone" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground }]}
                      placeholder="Telefonnummer (für SMS-Code)"
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
                    onPress={handleOnboardingRequestSms}
                  >
                    <Feather name="message-circle" size={20} color="#fff" />
                    <Text style={[styles.socialBtnText, { color: "#fff", fontSize: isSmallScreen ? 15 : 16 }]}>
                      SMS-Code anfordern
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
                    onPress={() => setOnboardingCustomerStep("register")}
                  >
                    <Feather name="arrow-left" size={18} color={colors.foreground} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Zurück</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>SMS-Bestätigung</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -6 }}>
                    Echte SMS-Versendung folgt mit Server-Anbindung (z. B. Twilio oder Firebase Phone Auth von Google).{"\n\n"}
                    Testcode: <Text style={{ fontFamily: "Inter_700Bold", color: colors.foreground }}>{DEV_SMS_CODE}</Text>
                  </Text>
                  <View style={[styles.onboardingInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Feather name="hash" size={18} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.onboardingInputField, { color: colors.foreground, letterSpacing: 4 }]}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.mutedForeground}
                      value={obRegSms}
                      onChangeText={(t) => setObRegSms(t.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                    />
                  </View>
                  <Pressable
                    style={[styles.socialBtn, {
                      backgroundColor: obRegSms.trim().length === 6 ? "#111111" : colors.muted,
                      borderColor: obRegSms.trim().length === 6 ? "#111111" : colors.border,
                      paddingVertical: isSmallScreen ? 13 : 16,
                    }]}
                    onPress={handleOnboardingCompleteRegister}
                    disabled={obRegSms.trim().length !== 6}
                  >
                    <Feather name="check" size={20} color={obRegSms.trim().length === 6 ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.socialBtnText, {
                      color: obRegSms.trim().length === 6 ? "#fff" : colors.mutedForeground,
                      fontSize: isSmallScreen ? 15 : 16,
                    }]}
                    >
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
                    router.push("/driver/login");
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

  /* ── Bottom sheet ── */
  sheet: {
    position: "absolute", bottom: TAB_HEIGHT, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 16, maxHeight: "76%",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetScroll: { flexShrink: 1 },

  /* Search pill */
  searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  searchPlaceholder: {
    flex: 1, flexDirection: "row", alignItems: "center",
    gap: 10, paddingHorizontal: 12, paddingVertical: 13,
    borderRadius: 50, borderWidth: 1,
  },
  searchIconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  searchPlaceholderText: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  spaeterBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 50, borderWidth: 1 },
  spaeterText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  /* Route card (Option B – zwei Zeilen mit Trennlinie) */
  routeCard: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  routeCardRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13, gap: 10,
  },
  routeCardDotOrigin: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "#999", borderWidth: 1.5, borderColor: "#555",
  },
  routeCardDotDest: { width: 9, height: 9, borderRadius: 5 },
  routeCardText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  routeCardSep: { height: 1, marginLeft: 14, marginRight: 14 },

  /* Quick destinations */
  quickSection: { marginHorizontal: 16, marginBottom: 4, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  quickIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  quickTextWrap: { flex: 1 },
  quickTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  quickSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  quickDivider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },

  /* Fahrzeug-Slider (Beige-Karten, Snap, Punkte) */
  vehicleSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
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
  bookingVehicleScroll: { flexDirection: "row", gap: 10, paddingVertical: 4, paddingRight: 4 },
  bookingVehicleChip: {
    width: 100,
    flexShrink: 0,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    gap: 6,
  },
  bookingVehicleIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  bookingVehicleName: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  bookingVehicleSub: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 13 },
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
  fareSection: { padding: 14, gap: 12, paddingBottom: 8 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 16 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  routeStrip: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 18 },
  routeStripItem: { flex: 1, alignItems: "center", gap: 4 },
  fareHighlight: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginHorizontal: 8, marginVertical: 4, backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  routeStripVal: { fontSize: 28, fontFamily: "Inter_700Bold" },
  routeStripDistance: { fontSize: 16, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  routeStripLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  routeStripDivider: { width: 1, height: 32 },
  routeStripDividerShort: { height: 22, alignSelf: "center" },
  panelLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -6 },
  timingRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  timingBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5,
    borderColor: "#E5E7EB", backgroundColor: "#F9FAFB",
  },
  timingBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
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
  scheduleBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  searchClearBtn: { padding: 2, marginLeft: 4 },
  searchClearCircle: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },

  /* Tab bar */
  tabBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: rs(7),
    shadowColor: "#000", shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 10,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(3), paddingBottom: rs(4) },
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
  saveModeBanner: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  saveModeBannerText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1,
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
