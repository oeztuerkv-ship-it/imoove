import { Dimensions, PixelRatio, Platform } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const BASE_W = 390;
const BASE_H = 844;

// Auf Web nicht skalieren — der Browser hat eigene Layoutregeln
// Auf nativem iOS/Android proportional skalieren, maximal 1.4×
const wScale = Platform.OS === "web" ? 1 : Math.min(SCREEN_W / BASE_W, 1.4);
const hScale = Platform.OS === "web" ? 1 : Math.min(SCREEN_H / BASE_H, 1.4);

/** Responsive size — skaliert mit Bildschirmbreite (Abstände, Icons, Radien) */
export function rs(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * wScale));
}

/** Responsive font — skaliert Schriftgröße proportional zur Bildschirmbreite */
export function rf(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * wScale));
}

/** Responsive height — skaliert mit Bildschirmhöhe */
export function rh(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * hScale));
}
