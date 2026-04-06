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

/** Platzhalter bis SMS über Backend (z. B. Twilio) oder Firebase Phone Auth angebunden ist. */
const DEV_SMS_CODE = process.env.EXPO_PUBLIC_DEV_SMS_CODE ?? "123456";

function isPlausibleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

const FIXPREIS_VOUCHER_HINT = "Fixpreis ist bei Transportschein nicht verfügbar";
const SEARCH_OVERLAY_BG = "#FFFFFF";

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

/** Kompakte Fahrzeugwahl nur im Buchungsmodus (gleiche Namen/Untertitel wie überall). */
function CompactBookingVehicleRow({
  colors,
  selectedVehicle,
  paymentMethod,
  onSelect,
}: {
  colors: { card: string; border: string; foreground: string; mutedForeground: string; primary: string };
  selectedVehicle: VehicleType | null;
  paymentMethod: PaymentMethod | null;
  onSelect: (id: VehicleType) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookingVehicleScroll}>
      {VEHICLES.map((v) => {
        const cfg = VEHICLE_ICON_CONFIG[v.id];
        const sel = selectedVehicle != null && selectedVehicle === v.id;
        const onrodaBlockedByVoucher = v.id === "onroda" && paymentMethod === "voucher";
        return (
          <Pressable
            key={v.id}
            onPress={() => onSelect(v.id)}
            style={[
              styles.bookingVehicleChip,
              {
                backgroundColor: colors.card,
                borderColor: sel ? colors.primary : colors.border,
                borderWidth: sel ? 2 : 1.5,
                opacity: onrodaBlockedByVoucher ? 0.48 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.bookingVehicleIconCircle,
                { backgroundColor: v.id === "wheelchair" ? "#E0F2FE" : "#F3F4F6" },
              ]}
            >
              <MaterialCommunityIcons
                name={cfg.icon as any}
                size={26}
                color={v.id === "wheelchair" ? "#0369A1" : VEHICLE_CAR_ICON}
              />
            </View>
            <Text
              style={[styles.bookingVehicleName, { color: sel ? colors.primary : colors.foreground }]}
              numberOfLines={1}
            >
              {v.name}
            </Text>
            <Text style={[styles.bookingVehicleSub, { color: colors.mutedForeground }]} numberOfLines={2}>
              {cfg.seats}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function bookingCtaLabel(vehicle: VehicleType | null, hasScheduledTime: boolean): string {
  if (!vehicle) return hasScheduledTime ? "Reservieren" : "Jetzt buchen";
  if (hasScheduledTime) return vehicle === "onroda" ? "Fixpreis reservieren" : "Reservieren";
  return vehicle === "onroda" ? "Fixpreis buchen" : "Jetzt buchen";
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

  const { loading: driverLoading, isLoggedIn: isDriverLoggedIn } = useDriver();
  const { profile, updateProfile, loginWithGoogle, registerLocalCustomer } = useUser();

  const {
    origin, destination, selectedVehicle, paymentMethod, isExempted,
    route, fareBreakdown, isLoadingRoute, routeError, scheduledTime,
    setOrigin, setDestination, setSelectedVehicle, setPaymentMethod, setIsExempted,
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
      router.replace("/driver/dashboard");
    }
  }, [isDriverLoggedIn]);

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
      const returnUrl = Linking.createURL("google-auth");
      const startRes = await fetch(`${API_URL}/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`);
      if (!startRes.ok) throw new Error("OAuth-Start fehlgeschlagen");
      const { authUrl } = (await startRes.json()) as { authUrl: string; state: string };

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
      if (result.type !== "success") return;

      const rawUrl = result.url.includes("://")
        ? result.url.replace(/^[a-z][a-z0-9+\-.]*:\/\//, "https://")
        : result.url;
      const returnedUrl = new URL(rawUrl);
      const errorParam = returnedUrl.searchParams.get("error");
      if (errorParam) throw new Error(`Google-Fehler: ${errorParam}`);

      const resultState = returnedUrl.searchParams.get("result");
      if (!resultState) throw new Error("Kein Ergebnis-Token empfangen.");

      const profileRes = await fetch(`${API_URL}/auth/google/profile?result=${resultState}`);
      if (!profileRes.ok) throw new Error("Profil konnte nicht geladen werden.");
      const data = (await profileRes.json()) as { googleId: string; name: string; email: string; photoUri: string | null };
      loginWithGoogle({ name: data.name, email: data.email, photoUri: data.photoUri, googleId: data.googleId });
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Google-Anmeldung fehlgeschlagen.");
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

  /* ── Route fetch ── */
  useEffect(() => {
    if (destination) fetchRoute();
  }, [destination, selectedVehicle, fetchRoute]);

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

  /* ── Booking ── */
  const canConfirmBook =
    selectedVehicle != null &&
    paymentMethod != null &&
    fareBreakdown != null &&
    !(selectedVehicle === "onroda" && paymentMethod === "voucher");

  const bookHintText =
    selectedVehicle == null && paymentMethod == null
      ? "Fahrzeug und Zahlungsart wählen – dann wird der Button grün."
      : selectedVehicle == null
        ? "Fahrzeug wählen – dann wird der Button grün."
        : "Zahlungsart wählen – dann wird der Button grün.";

  const handleBook = () => {
    if (!fareBreakdown || !paymentMethod || selectedVehicle == null) return;
    if (selectedVehicle === "onroda" && paymentMethod === "voucher") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push("/ride");
  };

  const handleBookingVehicleSelect = useCallback(
    (id: VehicleType) => {
      if (id === "onroda" && paymentMethod === "voucher") {
        setPaymentMethod(null);
        showComboHint(FIXPREIS_VOUCHER_HINT);
      }
      setSelectedVehicle(id);
      Haptics.selectionAsync();
    },
    [paymentMethod, setPaymentMethod, setSelectedVehicle, showComboHint],
  );

  const handlePaymentSelect = useCallback(
    (opt: (typeof PAYMENT_OPTIONS)[number]) => {
      if (opt.id === "voucher" && selectedVehicle === "onroda") {
        setSelectedVehicle(null);
        showComboHint(FIXPREIS_VOUCHER_HINT);
      }
      if (opt.id !== "voucher") setIsExempted(false);
      setPaymentMethod(opt.id);
      Haptics.selectionAsync();
    },
    [selectedVehicle, setSelectedVehicle, setPaymentMethod, setIsExempted, showComboHint],
  );

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


  const openScheduleModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/fahrt-reservieren");
  }, []);

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
  if (isDriverLoggedIn) {
    return <Redirect href="/driver/dashboard" />;
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
              style={[styles.spaeterBtn, {
                backgroundColor: scheduledTime ? "#FEF3C7" : colors.card,
                borderColor: scheduledTime ? "#F59E0B" : colors.border,
              }]}
              onPress={openScheduleModal}
            >
              <Feather name="calendar" size={14} color={scheduledTime ? "#D97706" : colors.foreground} />
              <Text style={[styles.spaeterText, { color: scheduledTime ? "#D97706" : colors.foreground }]}>
                {scheduledTime
                  ? `${scheduledTime.getHours().toString().padStart(2,"0")}:${scheduledTime.getMinutes().toString().padStart(2,"0")}`
                  : "Reservieren"}
              </Text>
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
            /* Buchungs-Panel */
            <View style={styles.fareSection}>

              {/* ── 1. ZEITWAHL ── */}
              <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>WANN?</Text>
              <View style={styles.timingRow}>
                <Pressable
                  style={[styles.timingBtn, !scheduledTime && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => { setScheduledTime(null); Haptics.selectionAsync(); }}
                >
                  <Feather name="zap" size={16} color={!scheduledTime ? "#fff" : colors.foreground} />
                  <Text style={[styles.timingBtnText, { color: !scheduledTime ? "#fff" : colors.foreground }]}>Sofort</Text>
                </Pressable>
                <Pressable
                  style={[styles.timingBtn, !!scheduledTime && { backgroundColor: "#F59E0B", borderColor: "#F59E0B" }]}
                  onPress={openScheduleModal}
                >
                  <Feather name="calendar" size={16} color={scheduledTime ? "#fff" : colors.foreground} />
                  <Text style={[styles.timingBtnText, { color: scheduledTime ? "#fff" : colors.foreground }]}>
                    {scheduledTime
                      ? `${scheduledTime.getHours().toString().padStart(2,"0")}:${scheduledTime.getMinutes().toString().padStart(2,"0")} Uhr`
                      : "Reservieren"}
                  </Text>
                </Pressable>
              </View>

              {/* ── 2. FAHRZEUG (kompakt – Beige-Slider nur auf der Hauptseite) ── */}
              <Text style={[styles.panelLabel, { color: colors.mutedForeground, marginTop: 14 }]}>FAHRZEUG</Text>
              <CompactBookingVehicleRow
                colors={{
                  card: colors.card,
                  border: colors.border,
                  foreground: colors.foreground,
                  mutedForeground: colors.mutedForeground,
                  primary: colors.primary,
                }}
                selectedVehicle={selectedVehicle}
                paymentMethod={paymentMethod}
                onSelect={handleBookingVehicleSelect}
              />

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

              {/* ── 3. ZAHLUNG ── */}
              <Text style={[styles.panelLabel, { color: colors.mutedForeground, marginTop: 14 }]}>ZAHLUNG</Text>
              <View style={styles.paymentGrid}>
                {PAYMENT_OPTIONS.map((opt) => {
                  const isSelected = paymentMethod === opt.id;
                  const voucherBlockedByOnroda = opt.isVoucher && selectedVehicle === "onroda";
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.paymentBtn, {
                        backgroundColor: colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                        borderWidth: isSelected ? 2 : 1.5,
                        opacity: voucherBlockedByOnroda ? 0.48 : 1,
                      }]}
                      onPress={() => handlePaymentSelect(opt)}
                    >
                      {opt.isEuro ? (
                        <Text style={[styles.euroSymbol, { color: colors.foreground }]}>€</Text>
                      ) : opt.isApp ? (
                        <Feather name="smartphone" size={14} color={colors.foreground} />
                      ) : opt.isPaypal ? (
                        <Text style={[styles.paypalText, { color: "#1565C0" }]}>P</Text>
                      ) : opt.isVoucher ? (
                        <MaterialCommunityIcons name="ticket-percent-outline" size={16} color={colors.foreground} />
                      ) : (
                        <Feather name={opt.featherIcon as any} size={14} color={colors.foreground} />
                      )}
                      <Text style={[styles.paymentBtnText, { color: colors.foreground }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {comboHint ? (
                <Text style={[styles.comboHintText, { color: ONRODA_MARK_RED }]}>{comboHint}</Text>
              ) : null}

              {paymentMethod === "voucher" && (
                <View style={[styles.voucherPanel, { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" }]}>
                  <View style={styles.voucherPriceRow}>
                    <View>
                      <Text style={styles.voucherLabel}>Voraussichtlicher Eigenanteil</Text>
                      {fareBreakdown && (
                        <Text style={styles.voucherAmount}>
                          {formatEuro(calculateCopayment(fareBreakdown.total, isExempted))}{isExempted ? "  (befreit)" : ""}
                        </Text>
                      )}
                      <Text style={styles.voucherSub}>Restbetrag wird direkt mit der Krankenkasse abgerechnet.</Text>
                    </View>
                  </View>
                  <Pressable style={styles.exemptRow} onPress={() => { setIsExempted(!isExempted); Haptics.selectionAsync(); }}>
                    <View style={[styles.exemptCheckbox, { borderColor: isExempted ? "#2563EB" : "#93C5FD", backgroundColor: isExempted ? "#2563EB" : "transparent" }]}>
                      {isExempted && <Feather name="check" size={12} color="#fff" />}
                    </View>
                    <Text style={[styles.exemptText, { color: "#1D4ED8" }]}>Ich bin von der Zuzahlung befreit</Text>
                  </Pressable>
                  <View style={styles.voucherHint}>
                    <MaterialCommunityIcons name="ticket-percent-outline" size={14} color="#2563EB" />
                    <Text style={styles.voucherHintText}>Gültigen Transportschein beim Fahrer bereithalten.</Text>
                  </View>
                </View>
              )}

              {/* ── 4. PREIS (nach Routenberechnung) ── */}
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
                  {!fareBreakdown ? (
                    <View style={[styles.routeStripItem, styles.fareHighlight, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                      <Text style={[styles.routeStripLabel, { color: colors.mutedForeground, marginBottom: 2 }]}>Preis</Text>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" }} numberOfLines={2}>
                        Bitte Fahrzeug wählen
                      </Text>
                    </View>
                  ) : paymentMethod === "voucher" ? (
                    <View style={[styles.routeStripItem, styles.fareHighlight]}>
                      <Text style={[styles.routeStripVal, { color: "#2563EB" }]}>
                        {formatEuro(calculateCopayment(fareBreakdown.total, isExempted))}
                      </Text>
                      <Text style={[styles.routeStripLabel, { color: "#2563EB" }]}>Eigenanteil</Text>
                    </View>
                  ) : fareBreakdown.fareKind === "onroda_fix" ? (
                    <View style={[styles.routeStripItem, styles.fareHighlight, { borderColor: ONRODA_MARK_RED + "55", backgroundColor: ONRODA_MARK_RED + "12" }]}>
                      <Text style={[styles.routeStripLabel, { color: ONRODA_MARK_RED, marginBottom: 2 }]}>Garantierter Festpreis</Text>
                      <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: ONRODA_MARK_RED }} numberOfLines={1}>
                        {formatEuro(fareBreakdown.total)}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.routeStripItem, styles.fareHighlight, { borderColor: ONRODA_MARK_RED + "55", backgroundColor: ONRODA_MARK_RED + "12" }]}>
                      <Text style={[styles.routeStripLabel, { color: ONRODA_MARK_RED, marginBottom: 2 }]}>Schätzpreis</Text>
                      <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: ONRODA_MARK_RED }} numberOfLines={1}>
                        {Math.round(fareBreakdown.total / 1.08)}–{Math.round(fareBreakdown.total)} €
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

            </View>
          )}
        </ScrollView>

        {destination && !isLoadingRoute && !routeError && route && (
          <View style={[styles.stickyBookRow, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 18 + bottomPad + 12 }]}>
            <View style={styles.stickyBookCol}>
              <Pressable
                disabled={!canConfirmBook}
                style={[
                  styles.bookBtn,
                  canConfirmBook
                    ? {
                        backgroundColor: "#16A34A",
                        borderWidth: 2,
                        borderColor: "#BBF7D0",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 5,
                        elevation: 3,
                      }
                    : {
                        backgroundColor: colors.muted,
                        borderWidth: 1.5,
                        borderColor: colors.border,
                      },
                ]}
                onPress={handleBook}
              >
                <Text
                  style={[
                    styles.bookBtnText,
                    { color: canConfirmBook ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {bookingCtaLabel(selectedVehicle, scheduledTime !== null)}
                </Text>
              </Pressable>
              {!canConfirmBook && (
                <Text style={[styles.bookBtnHint, { color: colors.mutedForeground }]}>
                  {bookHintText}
                </Text>
              )}
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

      {/* ── SEARCH OVERLAY ── */}
      {isSearchActive && (
        <View style={[styles.searchOverlay, { backgroundColor: SEARCH_OVERLAY_BG }]}>
          <View style={[styles.searchHeader, { paddingTop: topPad + 8, backgroundColor: SEARCH_OVERLAY_BG, borderBottomColor: "#E5E7EB" }]}>
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
            <View style={[styles.twoFieldCard, { backgroundColor: SEARCH_OVERLAY_BG, borderColor: "#E5E7EB" }]}>
              <View style={styles.dotsCol}>
                <View style={[styles.dotOrigin, isEditingOrigin && { borderColor: colors.primary }]} />
                <View style={[styles.dotLine, { backgroundColor: colors.border }]} />
                <View style={[styles.dotDestination, { backgroundColor: isEditingOrigin ? colors.border : colors.primary }]} />
              </View>
              <View style={styles.fieldsCol}>
                <Pressable style={[styles.fieldWrap, isEditingOrigin && { borderBottomColor: colors.primary }]} onPress={() => setIsEditingOrigin(true)}>
                  <TextInput ref={originInputRef} style={[styles.fieldInput, { color: colors.foreground }]} value={originQuery} onChangeText={handleOriginQueryChange} placeholder="Startadresse..." onFocus={() => setIsEditingOrigin(true)} />
                </Pressable>
                <View style={[styles.fieldSeparator, { backgroundColor: colors.border }]} />
                <View style={[styles.fieldWrap, !isEditingOrigin && { borderBottomColor: colors.primary }]}>
                  <TextInput ref={destInputRef} style={[styles.fieldInput, { color: colors.foreground }]} value={destQuery} onChangeText={handleDestQueryChange} placeholder="Ziel..." onFocus={() => setIsEditingOrigin(false)} />
                </View>
              </View>
            </View>
          </View>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: SEARCH_OVERLAY_BG }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView keyboardShouldPersistTaps="always" style={{ flex: 1 }} contentContainerStyle={styles.resultsContent}>
              {showDestResults && (
                <View style={styles.resultGroup}>
                  {destResults.map((loc, i) => (
                    <Pressable key={i} style={styles.resultRow} onPress={() => handleDestinationSelect(loc)}>
                      <Feather name="map-pin" size={15} color={colors.primary} />
                      <View style={styles.resultText}>
                        <Text style={styles.resultTitle}>{loc.displayName.split(",")[0]}</Text>
                        <Text style={styles.resultSub}>{loc.displayName.split(",").slice(1, 3).join(",")}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* ── WELCOME OVERLAY (not logged in) ── */}
      {!profile.isLoggedIn && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", zIndex: 9999, justifyContent: "center", alignItems: "center", padding: 24 }]}>
          <OnrodaOrMark size={100} />
          <Text style={{ fontSize: 32, fontWeight: "bold", marginTop: 24 }}>Onroda</Text>
          <Text style={{ color: "#666", marginTop: 8 }}>Mobilität ohne Grenzen</Text>
          <TouchableOpacity style={{ backgroundColor: "#000", padding: 18, borderRadius: 15, width: "100%", marginTop: 40 }} onPress={handleGoogleSignIn}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>Weiter mit Google</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  originChip: { position: "absolute", left: rs(20), right: rs(20), backgroundColor: "#fff", borderRadius: rs(14), padding: rs(10), elevation: 5, zIndex: 10 },
  originChipLabel: { fontSize: rf(12), color: "#B0B7C3" },
  originChipRow: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  originChipText: { flex: 1, fontSize: rf(17), fontWeight: "600" },
  originLocBtn: { width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  cancelFab: { position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#DC2626", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, elevation: 5, zIndex: 10 },
  cancelFabText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  sheet: { position: "absolute", bottom: TAB_HEIGHT, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  searchPlaceholder: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 50, borderWidth: 1 },
  searchIconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  searchPlaceholderText: { flex: 1, fontSize: 16 },
  spaeterBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 50, borderWidth: 1 },
  spaeterText: { fontSize: 14, fontWeight: "600" },
  routeCard: { marginHorizontal: 16, marginTop: 10, borderRadius: 14, borderWidth: 1 },
  routeCardRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  routeCardText: { flex: 1, fontSize: 15 },
  routeCardSep: { height: 1, marginHorizontal: 14 },
  quickSection: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  quickIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  quickTextWrap: { flex: 1 },
  quickTitle: { fontSize: 15, fontWeight: "500" },
  quickSub: { fontSize: 13, color: "#666" },
  quickDivider: { height: 1, marginLeft: 64 },
  vehicleSection: { paddingHorizontal: 16, paddingTop: 14 },
  vehicleSliderWrap: { width: "100%" },
  vehicleSliderSnapContent: { flexDirection: "row", paddingVertical: 8 },
  vehicleRefCard: { borderRadius: 22, overflow: "hidden", elevation: 3 },
  vehicleRefCardInner: { flexDirection: "row", alignItems: "center", padding: 16, minHeight: 118 },
  vehicleRefLeft: { flex: 1, paddingRight: 8 },
  vehicleRefLine1: { fontSize: 17, fontWeight: "700" },
  vehicleRefLine2: { fontSize: 17, fontWeight: "700" },
  vehicleRefMeta: { fontSize: 11, marginTop: 8 },
  vehicleRefCta: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100 },
  vehicleRefCtaText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  vehicleRefIllu: { width: 84, height: 90, justifyContent: "center", alignItems: "center" },
  vehicleSliderExpand: { padding: 16, borderTopWidth: 1 },
  vehicleSliderExpandLine: { fontSize: 13, lineHeight: 20 },
  vehicleSliderDots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 10 },
  vehicleSliderDot: { width: 7, height: 7, borderRadius: 4 },
  vehicleSliderDotActive: { width: 22 },
  fareSection: { padding: 14, gap: 12 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", paddingVertical: 16 },
  loadingText: { fontSize: 15 },
  routeStrip: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 18 },
  routeStripItem: { flex: 1, alignItems: "center", gap: 4 },
  fareHighlight: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginHorizontal: 8 },
  routeStripVal: { fontSize: 28, fontWeight: "700" },
  routeStripDistance: { fontSize: 16, fontWeight: "600" },
  routeStripLabel: { fontSize: 14, fontWeight: "600" },
  routeStripDivider: { width: 1, height: 32 },
  panelLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.8 },
  timingRow: { flexDirection: "row", gap: 10 },
  timingBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5 },
  timingBtnText: { fontSize: 15, fontWeight: "600" },
  paymentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentBtn: { flex: 1, minWidth: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5 },
  paymentBtnText: { fontSize: 13, fontWeight: "600" },
  stickyBookRow: { flexDirection: "row", paddingHorizontal: 14, paddingTop: 14, borderTopWidth: 1 },
  stickyBookCol: { flex: 1, gap: 8 },
  bookBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  bookBtnText: { fontSize: 17, fontWeight: "700" },
  bookBtnHint: { fontSize: 12, textAlign: "center" },
  tabBar: { flexDirection: "row", borderTopWidth: 1, height: 60 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabIconWrap: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  tabLabel: { fontSize: 11 },
  searchOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  searchHeader: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  searchHeaderRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  cancelBtn: { padding: 8 },
  cancelBtnText: { fontSize: 15, fontWeight: "500" },
  twoFieldCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 8 },
  dotsCol: { width: 32, alignItems: "center", justifyContent: "center" },
  dotOrigin: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  dotLine: { width: 1, flex: 1, marginVertical: 4 },
  dotDestination: { width: 8, height: 8, borderRadius: 4 },
  fieldsCol: { flex: 1 },
  fieldWrap: { paddingVertical: 10 },
  fieldInput: { fontSize: 15 },
  fieldSeparator: { height: 1 },
  resultsContent: { padding: 16 },
  resultGroup: { borderRadius: 14, borderWidth: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  resultText: { flex: 1 },
  resultTitle: { fontSize: 15, fontWeight: "500" },
  resultSub: { fontSize: 13, color: "#666" },
});
