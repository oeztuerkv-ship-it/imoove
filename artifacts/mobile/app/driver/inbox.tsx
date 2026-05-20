import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDriver } from "@/context/DriverContext";
import { getApiBaseUrl } from "@/utils/apiBase";

const API_BASE = getApiBaseUrl();

type DriverAdminMessage = {
  id: string;
  title: string;
  body: string;
  sentAt: string;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return "Gerade eben";
    if (diffMin < 60) return `Vor ${diffMin} Min.`;
    if (diffH < 24) return `Vor ${diffH} Std.`;
    if (diffD === 1) return "Gestern";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function DriverInboxScreen() {
  const router = useRouter();
  const { driver } = useDriver();
  const [messages, setMessages] = useState<DriverAdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());
  const READ_KEY = "onroda_driver_inbox_read_v1";

  const loadRead = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(READ_KEY);
      if (raw) setRead(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  const markRead = useCallback(async (id: string) => {
    setRead((prev) => {
      const next = new Set([...prev, id]);
      AsyncStorage.setItem(READ_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
    markRead(id);
  }, []);

  const fetchMessages = useCallback(async () => {
    const token = driver?.authToken?.trim();
    if (!token) return;
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/fleet-driver/v1/admin-messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(Array.isArray(data.items) ? data.items : []);
    } catch { setError("Nachrichten konnten nicht geladen werden."); }
  }, [driver?.authToken]);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchMessages();
    setLoading(false);
  }, [fetchMessages]);

  useEffect(() => { load(); loadRead(); }, [load, loadRead]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert("Löschen?", "Diese Nachricht wirklich entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: async () => {
        const token = driver?.authToken?.trim();
        if (!token) return;
        setDeleting((prev) => new Set([...prev, id]));
        try {
          await fetch(`${API_BASE}/fleet-driver/v1/admin-messages/${encodeURIComponent(id)}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
          });
          setMessages((prev) => prev.filter((m) => m.id !== id));
        } catch { Alert.alert("Fehler", "Bitte erneut versuchen."); }
        finally { setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
      }},
    ]);
  }, [driver?.authToken]);

  const renderItem = ({ item }: { item: DriverAdminMessage }) => {
    const isExpanded = expanded.has(item.id);
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 10, borderRadius: 14, backgroundColor: "#FFFFFF",
        shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
        elevation: 1, borderWidth: 1, borderColor: "#F0F0F5", overflow: "hidden", opacity: deleting.has(item.id) ? 0.4 : 1 }}>
        <View style={{ padding: 14 }}>
          {/* Header — klickbar */}
          <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: isExpanded ? 10 : 0 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5,
              backgroundColor: read.has(item.id) ? "transparent" : "#2563EB", marginRight: 10, marginTop: 4 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 17, color: "#000000" }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#8E8E93", marginTop: 2 }}>{formatDate(item.sentAt)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#C7C7CC" />
              <TouchableOpacity onPress={() => handleDelete(item.id)} disabled={deleting.has(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#F2F2F7",
                  alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="trash-can-outline" size={17} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
          {/* Body — nur wenn aufgeklappt */}
          {isExpanded && (
            <>
              <View style={{ height: 0.5, backgroundColor: "#E5E5EA", marginBottom: 10 }} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 16, color: "#3C3C43", lineHeight: 24 }}>{item.body}</Text>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center",
            justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#0F172A" }}>Posteingang</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Benachrichtigung</Text>
          {messages.length > 0 && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#94A3B8", marginTop: 2 }}>
              {messages.length} {messages.length === 1 ? "Nachricht" : "Nachrichten"}
            </Text>
          )}
        </View>
        <View style={{ width: 38, alignItems: "flex-end" }}>
          {messages.length > 0 && (
            <View style={{ backgroundColor: "#EF1D26", borderRadius: 10, minWidth: 22, height: 22,
              alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" }}>{messages.length}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#EF1D26" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: "#EFF6FF",
            alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <MaterialCommunityIcons name="wifi-off" size={34} color="#EF1D26" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#0F172A", marginBottom: 6 }}>Verbindungsfehler</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ backgroundColor: "#EF1D26", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" }}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: "#F1F5F9",
            alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <MaterialCommunityIcons name="email-open-outline" size={38} color="#CBD5E1" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: "#0F172A", marginBottom: 8 }}>Alles gelesen</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#94A3B8", textAlign: "center" }}>
            Neue Nachrichten vom ONRODA-Team erscheinen hier.
          </Text>
        </View>
      ) : (
        <FlatList data={messages} keyExtractor={(item) => item.id} renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMessages().finally(() => setRefreshing(false)); }} tintColor="#EF1D26" />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }} showsVerticalScrollIndicator={false} />
      )}
    </SafeAreaView>
  );
}
