import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { RideChatMessage } from "@/utils/rideChat";
import { RideChatComposer } from "./RideChatComposer";
import { RideChatThread } from "./RideChatThread";
import { RIDE_CHAT_THEME, type RideChatViewerRole } from "./rideChatTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  viewerRole: RideChatViewerRole;
  partnerDisplayName?: string | null;
  messages: RideChatMessage[];
  loading?: boolean;
  canSend: boolean;
  input: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
  onMessageLongPress?: (message: RideChatMessage) => void;
  replyBanner?: React.ReactNode;
  emptyHint?: string;
  title?: string;
};

export function RideChatModal({
  visible,
  onClose,
  viewerRole,
  partnerDisplayName,
  messages,
  loading,
  canSend,
  input,
  onInputChange,
  onSend,
  quickReplies,
  onQuickReply,
  onMessageLongPress,
  replyBanner,
  emptyHint,
  title = "Chat",
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Chat schließen">
              <Feather name="x" size={22} color="#374151" />
            </Pressable>
          </View>
          {replyBanner}
          <RideChatThread
            messages={messages}
            viewerRole={viewerRole}
            partnerDisplayName={partnerDisplayName}
            loading={loading}
            emptyHint={emptyHint}
            onMessageLongPress={onMessageLongPress}
          />
          <RideChatComposer
            value={input}
            onChangeText={onInputChange}
            onSend={onSend}
            canSend={canSend}
            quickReplies={quickReplies}
            onQuickReply={onQuickReply}
          />
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: RIDE_CHAT_THEME.panelBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 12,
    maxHeight: "78%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827" },
});
