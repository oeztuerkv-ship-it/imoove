import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { RideChatMessage } from "@/utils/rideChat";
import { RideChatBubble } from "./RideChatBubble";
import { RIDE_CHAT_THEME, type RideChatViewerRole } from "./rideChatTheme";

type Props = {
  messages: RideChatMessage[];
  viewerRole: RideChatViewerRole;
  loading?: boolean;
  emptyHint?: string;
  maxHeight?: number;
  onMessageLongPress?: (message: RideChatMessage) => void;
};

export function RideChatThread({
  messages,
  viewerRole,
  loading,
  emptyHint = "Noch keine Nachrichten.",
  maxHeight = 240,
  onMessageLongPress,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, messages[messages.length - 1]?.id]);

  return (
    <View style={[styles.box, { maxHeight }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={styles.scrollContent}
      >
        {loading && messages.length === 0 ? (
          <Text style={styles.empty}>{emptyHint}</Text>
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>{emptyHint}</Text>
        ) : (
          messages.map((m) => (
            <RideChatBubble
              key={m.id}
              message={m}
              viewerRole={viewerRole}
              onLongPress={
                onMessageLongPress && (m.from === "driver" || m.from === "customer")
                  ? () => onMessageLongPress(m)
                  : undefined
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    backgroundColor: RIDE_CHAT_THEME.threadBg,
    padding: 10,
    minHeight: 168,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 4 },
  empty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 18,
    textAlign: "center",
    paddingVertical: 24,
  },
});
