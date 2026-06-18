import { Platform } from "react-native";
import { PROVIDER_GOOGLE, type MapStyleElement } from "react-native-maps";

/**
 * iOS: Apple Maps (System) — funktioniert ohne Maps SDK for iOS / GMSApiKey.
 * Android: Google Maps. Siehe `.cursor/rules/imoove-mobile-google-maps-ios.mdc`.
 */
export const NATIVE_MAP_PROVIDER = Platform.OS === "android" ? PROVIDER_GOOGLE : undefined;

export function usesGoogleMapTiles(): boolean {
  return Platform.OS === "android";
}

/** Kurzlabel für Logs (DriverNav / MapsDiag). */
export function nativeMapProviderLabel(): string {
  return usesGoogleMapTiles() ? "PROVIDER_GOOGLE" : "AppleMaps (default)";
}

/**
 * Einheitliche MapView-Props für Kunde (RealMapView) und Fahrer-Navi.
 * iOS: kein mapType/customMapStyle — sonst oft graue Fläche statt Kacheln.
 */
export function nativeMapViewProps(options?: {
  androidCustomMapStyle?: MapStyleElement[];
}): {
  provider: typeof NATIVE_MAP_PROVIDER;
  customMapStyle?: MapStyleElement[];
} {
  if (usesGoogleMapTiles()) {
    return {
      provider: NATIVE_MAP_PROVIDER,
      ...(options?.androidCustomMapStyle?.length
        ? { customMapStyle: options.androidCustomMapStyle }
        : {}),
    };
  }
  return { provider: NATIVE_MAP_PROVIDER };
}
