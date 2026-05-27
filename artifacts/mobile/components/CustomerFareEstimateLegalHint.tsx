import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { CUSTOMER_FARE_ESTIMATE_LEGAL_DE } from "@/utils/customerFareEstimateLegal";

type Props = {
  align?: "left" | "center";
  style?: StyleProp<ViewStyle>;
};

/** Hinweis bei jeder Kunden-Schätzpreis-Anzeige (nicht verbindlich). */
export function CustomerFareEstimateLegalHint({ align = "center", style }: Props) {
  return (
    <View style={[styles.wrap, align === "center" && styles.wrapCenter, style]}>
      <Text style={[styles.text, align === "center" && styles.textCenter]}>
        {CUSTOMER_FARE_ESTIMATE_LEGAL_DE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 4,
  },
  wrapCenter: {
    alignItems: "center",
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    lineHeight: 17,
  },
  textCenter: {
    textAlign: "center",
  },
});
