import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";

type Props = {
  /** Referenzgröße (dp); steuert Schriftgröße */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Schriftzug „onroda“ im App-UI — keine Bildmarke im Header/Login.
 * Default bewusst kompakt für ruhigen, professionellen Eindruck.
 */
export function OnrodaOrMark({ size = 72, style }: Props) {
  const fontSize = Math.max(16, Math.round(size * 0.24));
  return (
    <View style={[{ justifyContent: "center", alignItems: "center" }, style]}>
      <Text
        style={{ fontSize, letterSpacing: -0.4 }}
        accessibilityRole="text"
        accessibilityLabel="onroda"
      >
        <Text style={{ fontFamily: "Inter_700Bold", color: ONRODA_MARK_RED }}>on</Text>
        <Text style={{ fontFamily: "Inter_700Bold", color: "#111827" }}>roda</Text>
      </Text>
    </View>
  );
}
