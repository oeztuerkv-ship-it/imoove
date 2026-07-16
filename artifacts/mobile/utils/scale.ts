import { Dimensions, PixelRatio, Platform } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/** Design-Basis: iPhone 14/15 (~390×844). */
const BASE_W = 390;
const BASE_H = 844;

/**
 * Breite-Skalierung getrennt für Abstände vs. Schrift:
 * Pro/Max (~430pt) würde bei gleicher 1.4×-Kappe Schrift + Padding zu stark aufblasen
 * → Action-Zeilen (Chat/Storno) wirken eng. Schrift daher schwächer deckeln.
 */
const wScaleRaw = Platform.OS === "web" ? 1 : SCREEN_W / BASE_W;
const wScaleSpace = Platform.OS === "web" ? 1 : Math.min(wScaleRaw, 1.15);
const wScaleFont = Platform.OS === "web" ? 1 : Math.min(wScaleRaw, 1.05);
const hScale = Platform.OS === "web" ? 1 : Math.min(SCREEN_H / BASE_H, 1.15);

/** Responsive size — Abstände, Icons, Radien (max ~1,15× auf großen iPhones). */
export function rs(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * wScaleSpace));
}

/** Responsive font — Schrift schwächer als Abstände (max ~1,05×). */
export function rf(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * wScaleFont));
}

/** Responsive height — skaliert mit Bildschirmhöhe (max ~1,15×). */
export function rh(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * hScale));
}
