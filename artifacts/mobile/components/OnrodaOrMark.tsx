import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";

type Props = {
  /** Kantenlänge des Squircle (dp) */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * App-Icon-Stil: abgerundetes Quadrat, Heller Verlauf (weiß → leicht dunkler),
 * „OR“ in Markenrot – gut lesbar (weiße Schrift auf hellem Grund wäre unsichtbar).
 */
export function OnrodaOrMark({ size = 88, style }: Props) {
  const corner = Math.round(size * 0.223);
  const fontSize = Math.round(size * 0.34);
  return (
    <LinearGradient
      colors={["#FAFAFA", "#E3E3E3"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: corner,
          justifyContent: "center",
          alignItems: "center",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(0,0,0,0.07)",
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize,
          fontFamily: "Inter_700Bold",
          color: ONRODA_MARK_RED,
          letterSpacing: -1,
          marginTop: -2,
        }}
        accessibilityLabel="Onroda"
      >
        OR
      </Text>
    </LinearGradient>
  );
}
