import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RideChatMessage } from "@/utils/rideChat";
import { rideChatSenderLabel } from "@/utils/rideChat";
import {
  formatRideChatTimestamp,
  rideChatBubbleVariant,
  RIDE_CHAT_THEME,
  type RideChatViewerRole,
} from "./rideChatTheme";

type Props = {
  message: RideChatMessage;
  viewerRole: RideChatViewerRole;
  partnerDisplayName?: string | null;
  onLongPress?: () => void;
};

export function RideChatBubble({ message, viewerRole, partnerDisplayName, onLongPress }: Props) {
  const variant = rideChatBubbleVariant(viewerRole, message.from);
  const theme =
    variant === "out" ? RIDE_CHAT_THEME.out : variant === "system" ? RIDE_CHAT_THEME.system : RIDE_CHAT_THEME.inPeer;
  const isOwn = variant === "out";
  const time = formatRideChatTimestamp(message.createdAt);

  const content = (
    <View
      style={[
        styles.bubble,
        theme.radius,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
          alignSelf: theme.align,
          maxWidth: variant === "system" ? "92%" : "82%",
        },
      ]}
    >
      {!isOwn ? (
        <Text style={[styles.meta, { color: theme.meta }]}>
          {rideChatSenderLabel(message.from, { partnerDisplayName })}
          {message.pending ? " · senden…" : ""}
        </Text>
      ) : null}
      {message.replyTo ? (
        <Text style={styles.replyQuote} numberOfLines={2}>
          {message.replyTo.from === viewerRole ? "Sie" : rideChatSenderLabel(message.replyTo.from, { partnerDisplayName })}: {message.replyTo.text}
        </Text>
      ) : null}
      <View style={styles.bodyRow}>
        <Text style={[styles.body, { color: theme.text }]}>{message.text}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    </View>
  );

  if (onLongPress) {
    return (
      <Pressable onLongPress={onLongPress} style={styles.row}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: { marginBottom: 8, width: "100%" },
  bubble: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  meta: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  replyQuote: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    marginBottom: 6,
    fontStyle: "italic",
  },
  bodyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 4,
    columnGap: 8,
    width: "100%",
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  time: {
    flexShrink: 0,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: RIDE_CHAT_THEME.timestamp,
    lineHeight: 14,
    marginBottom: 2,
  },
});
