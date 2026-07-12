import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { RequestStatus } from "@/context/RideRequestContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  apiMessageToRideChatMessage,
  isRideChatSendAllowed,
  mergeRideChatMessages,
  rideChatMessagesFromApi,
  rideChatSenderLabel,
  type RideChatMessage,
} from "@/utils/rideChat";
import { fetchFleetRideChatMessages, sendFleetRideChatMessage } from "@/utils/rideChatApi";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const QUICK_REPLIES = ["Bin unterwegs", "Bin angekommen", "Bitte kurz warten", "Kann ich Sie anrufen?"];

async function fleetAuthHeadersJson(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  rideStatus: RequestStatus;
  chatEnabled?: boolean;
};

export function DriverRideChatModal({ visible, onClose, rideId, rideStatus, chatEnabled }: Props) {
  const [liveChatEnabled, setLiveChatEnabled] = useState(Boolean(chatEnabled));
  const [liveStatus, setLiveStatus] = useState<RequestStatus>(rideStatus);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<RideChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const canSend = isRideChatSendAllowed(liveStatus, liveChatEnabled);

  useEffect(() => {
    setLiveChatEnabled(Boolean(chatEnabled));
    setLiveStatus(rideStatus);
  }, [chatEnabled, rideStatus, rideId]);

  useEffect(() => {
    if (!visible) return;
    setChatInput("");
    const id = rideId.trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const headers = await fleetAuthHeadersJson();
        const apiBase = getApiBaseUrl();
        const statusRes = await fetch(
          `${apiBase}/fleet-driver/v1/rides/${encodeURIComponent(id)}/live-status`,
          { cache: "no-store", headers },
        );
        if (statusRes.ok) {
          const payload = (await statusRes.json()) as { chatEnabled?: boolean; status?: string };
          if (!cancelled && typeof payload.chatEnabled === "boolean") {
            setLiveChatEnabled(payload.chatEnabled);
          }
          if (!cancelled && typeof payload.status === "string" && payload.status) {
            setLiveStatus(payload.status as RequestStatus);
          }
        }
        const items = await fetchFleetRideChatMessages(id, headers);
        if (!cancelled) setChatMsgs(rideChatMessagesFromApi(items));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, rideId]);

  const sendMessage = useCallback(async () => {
    const msg = chatInput.trim();
    const id = rideId.trim();
    if (!msg || !id || !canSend) return;
    setChatInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const headers = await fleetAuthHeadersJson();
      const result = await sendFleetRideChatMessage(id, msg, headers, `dm-${Date.now()}`);
      if (result.ok) {
        setChatMsgs((prev) => mergeRideChatMessages(prev, apiMessageToRideChatMessage(result.message)));
      }
    } catch {
      /* ignore */
    }
  }, [canSend, chatInput, rideId]);

  if (!liveChatEnabled) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Chat</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Chat schließen">
              <Feather name="x" size={22} color="#6B7280" />
            </Pressable>
          </View>
          <View style={styles.threadBox}>
            <ScrollView>
              {loading && chatMsgs.length === 0 ? (
                <Text style={styles.emptyHint}>Lade Nachrichten …</Text>
              ) : chatMsgs.length === 0 ? (
                <Text style={styles.emptyHint}>Noch keine Nachrichten. Schreiben Sie dem Kunden.</Text>
              ) : (
                chatMsgs.map((m) => (
                  <View
                    key={m.id}
                    style={m.from === "driver" ? styles.bubbleOutgoing : styles.bubbleIncoming}
                  >
                    <Text style={styles.bubbleMeta}>{rideChatSenderLabel(m.from)}</Text>
                    <Text style={styles.bubbleText}>{m.text}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
          <Text style={styles.templatesLabel}>Vorlagen</Text>
          <View style={styles.templatesWrap}>
            {QUICK_REPLIES.map((q) => (
              <Pressable key={q} style={styles.templateChip} onPress={() => setChatInput(q)}>
                <Text style={styles.templateChipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              placeholder={canSend ? "Nachricht tippen …" : "Chat beendet"}
              placeholderTextColor="#9CA3AF"
              value={chatInput}
              onChangeText={setChatInput}
              editable={canSend}
              multiline
            />
            <Pressable
              style={[styles.sendBtn, (!chatInput.trim() || !canSend) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!chatInput.trim() || !canSend}
            >
              <Feather name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: 16,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827" },
  threadBox: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    padding: 12,
    minHeight: 168,
    maxHeight: 240,
  },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18 },
  bubbleIncoming: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    marginBottom: 8,
  },
  bubbleOutgoing: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    backgroundColor: "#DCFCE7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#86EFAC",
    padding: 10,
    marginBottom: 8,
  },
  bubbleMeta: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#6B7280", marginBottom: 4 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#111827", lineHeight: 20 },
  templatesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#9CA3AF", letterSpacing: 0.4 },
  templatesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    backgroundColor: "#fff",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
});
