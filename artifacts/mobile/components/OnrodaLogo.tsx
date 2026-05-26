import React from "react";
import { View, Text } from "react-native";

interface Props {
  size?: number;
  textColor?: string;
}

export function OnrodaLogo({ size = 48, textColor = "#2D2D3A" }: Props) {
  const s = size;
  return (
    <View style={{ alignItems: "center", gap: s * 0.12 }}>
      {/* Pin Icon */}
      <View style={{ width: s, height: s * 1.1, alignItems: "center", justifyContent: "center" }}>
        {/* Outer ring */}
        <View style={{
          width: s * 0.82, height: s * 0.82, borderRadius: s * 0.41,
          borderWidth: s * 0.1, borderColor: "#EF1D26",
          borderBottomColor: "transparent", borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0, transform: [{ rotate: "0deg" }],
          position: "absolute", top: 0,
        }} />
        {/* Inner dot */}
        <View style={{
          width: s * 0.22, height: s * 0.22, borderRadius: s * 0.11,
          backgroundColor: "#EF1D26", position: "absolute", top: s * 0.22,
        }} />
        {/* Bottom chevron */}
        <View style={{
          width: s * 0.38, height: s * 0.38,
          borderRightWidth: s * 0.1, borderBottomWidth: s * 0.1,
          borderColor: "#C0392B", transform: [{ rotate: "45deg" }],
          position: "absolute", bottom: s * 0.02,
        }} />
      </View>
      {/* Text */}
      <Text style={{
        fontSize: s * 0.52, fontFamily: "Inter_700Bold",
        color: textColor, letterSpacing: s * 0.02,
      }}>
        ONRODA
      </Text>
    </View>
  );
}
