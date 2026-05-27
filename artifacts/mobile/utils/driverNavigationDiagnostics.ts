import Constants from "expo-constants";
import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";

const LOG_TAG = "[DriverNav]";

export type DriverNavigationMethod =
  | "react-native-maps-in-app"
  | "react-native-maps-provider-google"
  | "routing-osrm-public"
  | "routing-fallback-haversine"
  | "expo-go-web-fallback";

export type GoogleMapsKeyProbe = {
  configured: boolean;
  source: "expo.ios.config" | "expo.android.config" | "env" | "none";
  keyPrefix: string | null;
  keyLength: number;
};

export function probeGoogleMapsApiKey(): GoogleMapsKeyProbe {
  const iosKey = String(Constants.expoConfig?.ios?.config?.googleMapsApiKey ?? "").trim();
  const androidKey = String(
    (Constants.expoConfig?.android?.config as { googleMaps?: { apiKey?: string } } | undefined)
      ?.googleMaps?.apiKey ?? "",
  ).trim();
  const envKey = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();

  const key = iosKey || androidKey || envKey;
  if (!key) {
    return { configured: false, source: "none", keyPrefix: null, keyLength: 0 };
  }
  const source: GoogleMapsKeyProbe["source"] = iosKey
    ? "expo.ios.config"
    : androidKey
      ? "expo.android.config"
      : "env";
  return {
    configured: true,
    source,
    keyPrefix: key.slice(0, 8),
    keyLength: key.length,
  };
}

export function describeDriverNavigationRuntime(): Record<string, string | boolean | number> {
  const ownership = Constants.appOwnership ?? "unknown";
  const executionEnv = Constants.executionEnvironment ?? "unknown";
  return {
    platform: Platform.OS,
    appOwnership: ownership,
    executionEnvironment: executionEnv,
    bundleId:
      Platform.OS === "ios"
        ? Constants.expoConfig?.ios?.bundleIdentifier ?? ""
        : Constants.expoConfig?.android?.package ?? "",
    isExpoGo: ownership === "expo",
    isDevClient: executionEnv === "storeClient" ? false : executionEnv !== "bare",
    mapProvider: PROVIDER_GOOGLE,
  };
}

export type DriverNavigationOpenLogInput = {
  rideId?: string;
  phase: string;
  pickup: { lat: number; lon: number; name: string };
  destination: { lat: number; lon: number; name: string };
  from: { lat: number; lon: number; name: string };
  routingUrl?: string;
  routingMethod?: DriverNavigationMethod;
  extra?: Record<string, unknown>;
};

export function logDriverNavigationOpen(input: DriverNavigationOpenLogInput): void {
  const keyProbe = probeGoogleMapsApiKey();
  const runtime = describeDriverNavigationRuntime();
  console.log(LOG_TAG, "navigation_open", {
    ...runtime,
    rideId: input.rideId ?? "",
    phase: input.phase,
    pickup: input.pickup,
    destination: input.destination,
    from: input.from,
    googleMapsApiKey: {
      configured: keyProbe.configured,
      source: keyProbe.source,
      prefix: keyProbe.keyPrefix,
      length: keyProbe.keyLength,
    },
    routing: {
      method: input.routingMethod ?? "routing-osrm-public",
      url: input.routingUrl ?? "https://router.project-osrm.org/route/v1/driving/…",
      note: "Fahrer-Navi nutzt OSRM, nicht Google Directions API",
    },
    map: {
      method: "react-native-maps",
      provider: "PROVIDER_GOOGLE",
      requiresNativeBuild:
        "Expo Go liefert auf iOS oft keine Google-Kacheln — Development Build / EAS nötig",
    },
    ...input.extra,
  });
}

export function logDriverNavigationRouteResult(input: {
  ok: boolean;
  source: "osrm" | "fallback";
  distanceKm?: number;
  durationMinutes?: number;
  stepCount?: number;
  polylinePoints?: number;
  httpStatus?: number;
  error?: string;
}): void {
  console.log(LOG_TAG, "routing_result", input);
}

export function logDriverNavigationMapEvent(event: string, detail?: Record<string, unknown>): void {
  console.log(LOG_TAG, event, detail ?? {});
}
