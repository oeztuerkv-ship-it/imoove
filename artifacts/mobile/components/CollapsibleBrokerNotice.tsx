import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CUSTOMER_BROKER_NOTICE_DE } from "@/constants/customerBrokerNoticeDe";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { useColors } from "@/hooks/useColors";
import { rf } from "@/utils/scale";

export function CollapsibleBrokerNotice() {
  const colors = useColors();
  const { config: appCfg } = useOnrodaAppConfig();
  const [expanded, setExpanded] = useState(false);
  const noticeDe =
    (typeof appCfg.system?.globalNoticeDe === "string" ? appCfg.system.globalNoticeDe.trim() : "") ||
    CUSTOMER_BROKER_NOTICE_DE;

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      style={[
        styles.box,
        {
          backgroundColor: "#F0FDFA",
          borderColor: "#99F6E4",
        },
        Platform.select({
          ios: {
            shadowColor: "#0F766E",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
          },
          android: { elevation: 3 },
          default: {},
        }),
      ]}
    >
      <MaterialCommunityIcons name="information-outline" size={20} color="#0D9488" style={{ marginTop: 1 }} />
      <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={expanded ? 0 : 2}>
        {noticeDe}
      </Text>
      <Feather
        name={expanded ? "chevron-down" : "chevron-right"}
        size={16}
        color="#0D9488"
        style={{ marginTop: 2 }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontSize: rf(11), fontFamily: "Inter_400Regular", lineHeight: rf(16) },
});
