import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { customerFareDisplayLines } from "@/utils/customerFareDisplay";
import { rf } from "@/utils/scale";

type Props = {
  vehicle: string | null | undefined;
  surchargeEur?: number | null;
  walletHint?: boolean;
  align?: "left" | "center";
  primaryStyle?: StyleProp<TextStyle>;
  secondaryStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
};

/** Kunden-Preiszeile: Taxameter (kein Euro); XL/Rollstuhl optional + Aufschlag. */
export function CustomerFarePriceBlock({
  vehicle,
  surchargeEur,
  walletHint = false,
  align = "left",
  primaryStyle,
  secondaryStyle,
  style,
}: Props) {
  const lines = customerFareDisplayLines({ vehicle, surchargeEur, walletHint });
  return (
    <View style={[styles.wrap, align === "center" && styles.wrapCenter, style]}>
      <Text style={[styles.primary, align === "center" && styles.textCenter, primaryStyle]}>
        {lines.primary}
      </Text>
      {lines.secondary ? (
        <Text style={[styles.secondary, align === "center" && styles.textCenter, secondaryStyle]}>
          {lines.secondary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  wrapCenter: { alignItems: "center" },
  primary: {
    fontSize: rf(18),
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  secondary: {
    fontSize: rf(12),
    fontFamily: "Inter_600SemiBold",
    color: "#2563EB",
  },
  textCenter: { textAlign: "center" },
});
