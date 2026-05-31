import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const MESSAGE_KK =
  "Sie sind nicht berechtigt. Bitte wenden Sie sich an ONRODA.";
const MESSAGE_MEDICAL =
  "Krankenfahrten sind für Sie derzeit nicht freigeschaltet. Bitte wenden Sie sich an ONRODA.";

type Props = {
  compact?: boolean;
  /** `kk` = KK-Modul / Transportschein; `medical` = operative Krankenfahrt-Freigabe */
  variant?: "kk" | "medical";
};

export function MedicalTransportNotAuthorizedCard({ compact, variant = "kk" }: Props) {
  const message = variant === "medical" ? MESSAGE_MEDICAL : MESSAGE_KK;
  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <MaterialCommunityIcons name="hospital-box-outline" size={compact ? 20 : 22} color="#64748B" />
      <Text style={[styles.text, compact && styles.textCompact]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CBD5E1",
  },
  rootCompact: {
    padding: 12,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#475569",
    lineHeight: 19,
  },
  textCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
});
