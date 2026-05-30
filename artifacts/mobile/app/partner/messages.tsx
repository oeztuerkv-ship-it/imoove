import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HOME_SHEET_BG, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { usePartner } from "@/context/PartnerContext";
import {
  partnerDeleteMessage,
  partnerFetchMessages,
  partnerMarkMessageRead,
  type PartnerMessageRow,
} from "@/utils/partnerApi";

const ONRODA_RED = "#EF1D26";
const PARTNER_GREEN = "#15803D";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PartnerMessagesScreen() {
  const insets = useSafeAreaInsets();
  const { token, handleUnauthorized, refreshUnreadMessageCount } = usePartner();
  const [items, setItems] = useState<PartnerMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PartnerMessageRow | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await partnerFetchMessages(token);
    setLoading(false);
    if (r.ok) {
      setItems(r.data);
      return;
    }
    if (r.unauthorized) {
      await handleUnauthorized();
      router.replace("/partner/login");
    }
  }, [token, handleUnauthorized]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshUnreadMessageCount();
    }, [load, refreshUnreadMessageCount]),
  );

  const confirmDelete = (msg: PartnerMessageRow, onDone: () => void) => {
    Alert.alert("Nachricht löschen?", "Die Mitteilung wird aus Ihrem Posteingang entfernt.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => void (async () => {
          if (!token) return;
          const r = await partnerDeleteMessage(token, msg.id);
          if (!r.ok) {
            if (r.unauthorized) {
              await handleUnauthorized();
              router.replace("/partner/login");
              return;
            }
            Alert.alert("Löschen fehlgeschlagen", r.message);
            return;
          }
          setItems((prev) => prev.filter((row) => row.id !== msg.id));
          void refreshUnreadMessageCount();
          onDone();
        })(),
      },
    ]);
  };

  const openMessage = async (msg: PartnerMessageRow) => {
    setSelected(msg);
    if (msg.isRead || !token) return;
    const r = await partnerMarkMessageRead(token, msg.id);
    if (r.ok) {
      setItems((prev) => prev.map((row) => (row.id === r.data.id ? r.data : row)));
      setSelected(r.data);
      void refreshUnreadMessageCount();
      return;
    }
    if (r.unauthorized) {
      await handleUnauthorized();
      router.replace("/partner/login");
      return;
    }
    setItems((prev) =>
      prev.map((row) =>
        row.id === msg.id ? { ...row, isRead: true, readAt: new Date().toISOString() } : row,
      ),
    );
    setSelected({ ...msg, isRead: true, readAt: new Date().toISOString() });
    void refreshUnreadMessageCount();
  };

  if (selected) {
    return (
      <View style={[styles.root, { backgroundColor: HOME_SHEET_BG, paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => setSelected(null)} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#111" />
          </Pressable>
          <Text style={styles.topTitle}>Nachricht</Text>
          <Pressable
            onPress={() => confirmDelete(selected, () => setSelected(null))}
            style={styles.iconBtn}
            accessibilityLabel="Nachricht löschen"
          >
            <Feather name="trash-2" size={20} color="#EF1D26" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.detailCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
            <Text style={styles.detailMeta}>{fmtDateTime(selected.createdAt)}</Text>
            <Text style={styles.detailSubject}>{selected.subject}</Text>
            <Text style={styles.detailBody}>{selected.body}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: HOME_SHEET_BG, paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#111" />
        </Pressable>
        <Text style={styles.topTitle}>Posteingang</Text>
        <View style={styles.iconBtn} />
      </View>
      <Text style={styles.hint}>Mitteilungen von ONRODA — keine Antwort nötig.</Text>
      {loading ? (
        <ActivityIndicator color={PARTNER_GREEN} style={{ marginTop: 24 }} />
      ) : items.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
          <Text style={styles.emptyText}>Keine Nachrichten.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}
        >
          {items.map((m) => (
            <Pressable
              key={m.id}
              style={[styles.row, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}
              onPress={() => void openMessage(m)}
            >
              {!m.isRead ? <View style={styles.unreadDot} /> : <View style={styles.unreadSpacer} />}
              <View style={styles.rowText}>
                <Text style={[styles.rowSubject, !m.isRead && styles.rowSubjectUnread]} numberOfLines={2}>
                  {m.subject}
                </Text>
                <Text style={styles.rowDate}>{fmtDateTime(m.createdAt)}</Text>
              </View>
              <Pressable
                onPress={() => confirmDelete(m, () => {})}
                hitSlop={8}
                accessibilityLabel="Nachricht löschen"
              >
                <Feather name="trash-2" size={18} color="#9CA3AF" />
              </Pressable>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111" },
  hint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ONRODA_RED,
  },
  unreadSpacer: { width: 8 },
  rowText: { flex: 1, minWidth: 0 },
  rowSubject: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#6B7280" },
  rowSubjectUnread: { fontFamily: "Inter_700Bold", color: "#111" },
  rowDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 4 },
  emptyCard: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#9CA3AF" },
  detailCard: { borderRadius: 14, borderWidth: 1, padding: 18 },
  detailMeta: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#6B7280", marginBottom: 8 },
  detailSubject: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111", marginBottom: 14 },
  detailBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 22 },
});
