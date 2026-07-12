import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RideChatReplyTarget } from "@/utils/rideChat";

type Props = {
  replyTo: RideChatReplyTarget;
  viewerRole: "customer" | "driver";
  onClear: () => void;
};

export function RideChatReplyBanner({ replyTo, viewerRole, onClear }: Props) {
  const label =
    replyTo.from === viewerRole
      ? "Sie"
      : replyTo.from === "driver"
        ? "Fahrer"
        : "Kunde";
  return (
    <View style={styles.banner}>
      <Text style={styles.label} numberOfLines={1}>
        Antwort auf {label}: {replyTo.text}
      </Text>
      <Pressable onPress={onClear} hitSlop={8}>
        <Feather name="x" size={16} color="#6B7280" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  label: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#4B5563" },
});
