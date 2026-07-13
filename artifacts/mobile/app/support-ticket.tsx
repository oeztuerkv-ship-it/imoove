import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { rf, rs } from "@/utils/scale";

type TicketDetail = {
  id: string;
  kind: "app" | "ride";
  category: string;
  status: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  rideId: string | null;
  canReply: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  resolved: "Erledigt",
};

function statusColor(status: string) {
  if (status === "resolved") return "#16A34A";
  if (status === "in_progress") return "#D97706";
  return "#0F766E";
}

function parseMessageThread(message: string): string[] {
  const parts = message
    .split(/\n\n— .+? —\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : message.trim() ? [message.trim()] : [];
}

function fmtDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function SupportTicketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const ticketId = typeof params.id === "string" ? params.id.trim() : "";
  const { profile } = useUser();
  const sessionToken = profile.sessionToken?.trim() || "";

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const apiBase = getApiBaseUrl();

  const load = useCallback(async () => {
    if (!ticketId || !sessionToken || !apiBase) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/customer/v1/support/tickets/${encodeURIComponent(ticketId)}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; ticket?: TicketDetail };
      if (res.ok && data.ok && data.ticket) {
        setTicket(data.ticket);
      } else {
        setTicket(null);
      }
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, sessionToken, ticketId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 12_000);
    return () => clearInterval(id);
  }, [load]);

  const bubbles = useMemo(() => (ticket ? parseMessageThread(ticket.message) : []), [ticket]);

  async function sendReply() {
    if (!ticket?.canReply || !sessionToken || !apiBase) return;
    const text = reply.trim();
    if (text.length < 2) return;
    setSending(true);
    try {
      const res = await fetch(
        `${apiBase}/customer/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ message: text }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        Alert.alert("Senden fehlgeschlagen", "Nachricht konnte nicht gesendet werden.");
        return;
      }
      setReply("");
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {
      Alert.alert("Netzwerk", "Verbindung fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  const topPad = Platform.OS === "web" ? 44 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={topPad}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_PANEL }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Support-Chat</Text>
          {ticket ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {ticket.kind === "ride" ? "Fahrt · " : ""}
              {ticket.category}
            </Text>
          ) : null}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.foreground} />
      ) : !ticket ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.mutedForeground }}>Ticket nicht gefunden.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.thread}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            <View style={[styles.statusPill, { backgroundColor: `${statusColor(ticket.status)}18` }]}>
              <Text style={[styles.statusText, { color: statusColor(ticket.status) }]}>
                {STATUS_LABEL[ticket.status] ?? ticket.status} · {fmtDt(ticket.updatedAt)}
              </Text>
            </View>

            {ticket.rideId ? (
              <Pressable
                style={[styles.rideLink, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
                onPress={() => router.push(`/ride-detail?id=${encodeURIComponent(ticket.rideId!)}&focus=support`)}
              >
                <Feather name="map-pin" size={14} color="#0F766E" />
                <Text style={styles.rideLinkText}>Zur Fahrt · {ticket.rideId.slice(0, 10)}…</Text>
              </Pressable>
            ) : null}

            {bubbles.map((body, i) => (
              <View key={i} style={[styles.bubble, styles.bubbleCustomer]}>
                <Text style={styles.bubbleMeta}>Sie · {i === 0 ? fmtDt(ticket.createdAt) : ""}</Text>
                <Text style={styles.bubbleText}>{body}</Text>
              </View>
            ))}

            {ticket.status === "resolved" ? (
              <View style={[styles.bubble, styles.bubbleSystem]}>
                <Text style={styles.bubbleSystemText}>Dieses Ticket ist erledigt. Bei neuem Anliegen bitte neue Anfrage stellen.</Text>
              </View>
            ) : (
              <View style={[styles.bubble, styles.bubbleSystem]}>
                <Text style={styles.bubbleSystemText}>Unser Team bearbeitet Ihre Anfrage. Sie können hier nachrichten.</Text>
              </View>
            )}
          </ScrollView>

          {ticket.canReply ? (
            <View style={[styles.composer, { paddingBottom: insets.bottom + 8, borderTopColor: HOME_SHEET_RIM }]}>
              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder="Nachricht schreiben …"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[styles.composerInput, { color: colors.foreground, borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}
              />
              <Pressable
                onPress={() => void sendReply()}
                disabled={sending || reply.trim().length < 2}
                style={[styles.sendBtn, { opacity: sending || reply.trim().length < 2 ? 0.5 : 1 }]}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={18} color="#fff" />}
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  thread: { padding: rs(16), gap: rs(10), paddingBottom: rs(24) },
  statusPill: { alignSelf: "center", paddingHorizontal: rs(12), paddingVertical: rs(6), borderRadius: rs(20) },
  statusText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
  rideLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    padding: rs(10),
    borderRadius: rs(12),
    borderWidth: 1,
  },
  rideLinkText: { fontSize: rf(13), fontFamily: "Inter_600SemiBold", color: "#0F766E" },
  bubble: { maxWidth: "88%", borderRadius: rs(16), padding: rs(12) },
  bubbleCustomer: { alignSelf: "flex-end", backgroundColor: "#0F766E" },
  bubbleMeta: { fontSize: rf(10), color: "rgba(255,255,255,0.75)", marginBottom: rs(4), fontFamily: "Inter_500Medium" },
  bubbleText: { fontSize: rf(14), color: "#fff", fontFamily: "Inter_400Regular", lineHeight: rf(20) },
  bubbleSystem: { alignSelf: "center", backgroundColor: HOME_SHEET_INNER, borderWidth: 1, borderColor: HOME_SHEET_RIM },
  bubbleSystemText: { fontSize: rf(12), color: "#64748B", textAlign: "center", fontFamily: "Inter_400Regular" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: rs(8),
    paddingHorizontal: rs(12),
    paddingTop: rs(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: HOME_SHEET_PANEL,
  },
  composerInput: {
    flex: 1,
    minHeight: rs(44),
    maxHeight: rs(120),
    borderWidth: 1,
    borderRadius: rs(14),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontSize: rf(15),
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
});
