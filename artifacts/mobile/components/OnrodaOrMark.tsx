import React from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  /** Höhe des Logos (dp); Breite proportional */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const logo = require("../assets/images/onroda-logo.png");

/**
 * Offizielles ONRODA-Logo (PNG), nicht verzerren — `resizeMode: contain`.
 */
export function OnrodaOrMark({ size = 88, style }: Props) {
  const h = Math.round(size * 1.12);
  return (
    <View style={[{ width: size, height: h, justifyContent: "center", alignItems: "center" }, style]}>
      <Image
        source={logo}
        accessibilityLabel="ONRODA"
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </View>
  );
}
