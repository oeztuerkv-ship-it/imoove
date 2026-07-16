import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { CUSTOMER_FARE_ESTIMATE_LEGAL_DE } from "@/utils/customerFareEstimateLegal";
import { rf, rs } from "@/utils/scale";

export function CustomerTaxameterBillingNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, style]}>
      <Feather name="info" size={14} color="#16A34A" style={{ marginTop: 1 }} />
      <Text style={styles.text}>
        <Text style={styles.strong}>{CUSTOMER_FARE_ESTIMATE_LEGAL_DE}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(8),
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
  },
  text: { flex: 1, fontSize: rf(12), lineHeight: rf(17) },
  strong: { fontFamily: "Inter_700Bold", color: "#166534" },
});
