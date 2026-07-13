import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rf, rs } from "@/utils/scale";

type InboxItem = {
  id: string;
  kind: "app" | "ride";
  category: string;
  status: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  rideId: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  in_progress: "Bearbeitung",
  resolved: "Erledigt",
};

function statusColor(status: string) {
  if (status === "resolved") return "#16A34A";
  if (status === "in_progress") return "#D97706";
  return "#0F766E";
}

export default function CustomerSupportInbox({ refreshKey = 0 }: { refreshKey?: number }) {
  const colors = useColors();
  const { profile } = useUser();
  const sessionToken = profile.sessionToken?.trim() || "";
  const isLoggedIn = profile.isLoggedIn && sessionToken.length > 0;

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn) {
      setItems([]);
      return;
    }
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/customer/v1/support/inbox`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: InboxItem[] };
      if (res.ok && data.ok && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, sessionToken]);

  useEffect(() => {
    void load();
    if (!isLoggedIn) return;
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load, isLoggedIn, refreshKey]);

  if (!isLoggedIn) {
    return (
      <Pressable
        onPress={() => router.replace("/profile")}
        style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}
      >
        <Feather name="message-circle" size={rs(20)} color="#0F766E" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Meine Support-Anfragen</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Zum Öffnen und Chatten bitte anmelden.</Text>
        </View>
        <Feather name="chevron-right" size={rs(18)} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.foreground }]}>Meine Anfragen</Text>
        {loading ? <ActivityIndicator size="small" color={colors.foreground} /> : null}
      </View>

      {items.length === 0 && !loading ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Noch keine Tickets — unten eine neue Anfrage senden.
        </Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/support-ticket?id=${encodeURIComponent(item.id)}`)}
              style={[styles.row, { backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM }]}
            >
              <View style={[styles.kindIcon, { backgroundColor: item.kind === "ride" ? "#E0F2FE" : "#ECFDF5" }]}>
                <Feather name={item.kind === "ride" ? "navigation" : "help-circle"} size={rs(16)} color="#0F766E" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.kind === "ride" ? "Fahrt · " : ""}
                  {item.category}
                </Text>
                <Text style={[styles.rowPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {item.preview || "—"}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor(item.status)}20` }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor(item.status) }]}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: rs(16), borderWidth: 1, padding: rs(16), gap: rs(12) },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
  list: { gap: rs(8) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(14),
    borderWidth: 1,
  },
  kindIcon: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(12),
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  rowPreview: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: rs(2) },
  statusBadge: { paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(10) },
  statusBadgeText: { fontSize: rf(10), fontFamily: "Inter_700Bold" },
});
