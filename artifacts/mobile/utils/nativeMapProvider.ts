import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";

/**
 * iOS: Apple Maps (System) — funktioniert ohne Maps SDK for iOS / GMSApiKey.
 * Android: Google Maps. Siehe `.cursor/rules/imoove-mobile-google-maps-ios.mdc`.
 */
export const NATIVE_MAP_PROVIDER = Platform.OS === "android" ? PROVIDER_GOOGLE : undefined;

export function usesGoogleMapTiles(): boolean {
  return Platform.OS === "android";
}
