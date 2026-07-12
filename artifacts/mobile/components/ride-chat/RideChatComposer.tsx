import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { RIDE_CHAT_THEME } from "./rideChatTheme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
  placeholder?: string;
};

export function RideChatComposer({
  value,
  onChangeText,
  onSend,
  canSend,
  quickReplies = [],
  onQuickReply,
  placeholder = "Nachricht tippen …",
}: Props) {
  return (
    <View style={styles.wrap}>
      {quickReplies.length > 0 ? (
        <>
          <Text style={styles.templatesLabel}>Vorlagen</Text>
          <View style={styles.templatesWrap}>
            {quickReplies.map((q) => (
              <Pressable key={q} style={styles.chip} onPress={() => onQuickReply?.(q)}>
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={canSend ? placeholder : "Chat beendet"}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          editable={canSend}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!value.trim() || !canSend) && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!value.trim() || !canSend}
          accessibilityLabel="Nachricht senden"
        >
          <Feather name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  templatesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#9CA3AF", letterSpacing: 0.4 },
  templatesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    backgroundColor: RIDE_CHAT_THEME.composerBg,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RIDE_CHAT_THEME.sendBtn,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
});
