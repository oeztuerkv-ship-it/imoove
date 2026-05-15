import { Platform, type TextStyle } from "react-native";

import { rf } from "@/utils/scale";

const androidLabel: TextStyle =
  Platform.OS === "android" ? { includeFontPadding: false } : {};

/**
 * Primärschrift für Konto-/Geldbörse-Zeilen und Sektions-Pills — eine Quelle, damit Schriftgröße und Zeilenhöhe nicht auseinanderlaufen.
 */
export const accountSheetPrimaryLabel: TextStyle = {
  fontSize: rf(15),
  lineHeight: rf(20),
  fontFamily: "Inter_500Medium",
  ...androidLabel,
};

/** Sekundärtext (Hilfe-Antworten, Meta-Zeilen, Unterzeilen) */
export const accountSheetSecondaryLabel: TextStyle = {
  fontSize: rf(13),
  lineHeight: rf(19),
  fontFamily: "Inter_400Regular",
  ...androidLabel,
};
