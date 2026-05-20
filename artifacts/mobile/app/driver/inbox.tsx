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
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DriverInboxScreen() {
  const router = useRouter();
  const { driver } = useDriver();
  const [messages, setMessages] = useState<DriverAdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

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
    } catch {
      setError("Nachrichten konnten nicht geladen werden.");
    }
  }, [driver?.authToken]);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchMessages();
    setLoading(false);
  }, [fetchMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  }, [fetchMessages]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback((id: string, title: string) => {
    Alert.alert(
      "Nachricht löschen",
      `"${title}" wirklich löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            const token = driver?.authToken?.trim();
            if (!token) return;
            setDeleting((prev) => new Set([...prev, id]));
            try {
              await fetch(`${API_BASE}/fleet-driver/v1/admin-messages/${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              setMessages((prev) => prev.filter((m) => m.id !== id));
            } catch {
              Alert.alert("Fehler", "Löschen fehlgeschlagen. Bitte erneut versuchen.");
            } finally {
              setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
            }
          },
        },
      ],
    );
  }, [driver?.authToken]);

  const renderItem = ({ item }: { item: DriverAdminMessage }) => (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
        opacity: deleting.has(item.id) ? 0.4 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF1D26", marginRight: 8, marginTop: 5 }} />
        <Text style={{ flex: 1, fontFamily: "Inter_700Bold", fontSize: 15, color: "#0F172A" }}>
          {item.title}
        </Text>
        <TouchableOpacity
          onPress={() => handleDelete(item.id, item.title)}
          disabled={deleting.has(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 8 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#334155", lineHeight: 20, marginBottom: 8, marginLeft: 16 }}>
        {item.body}
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#94A3B8", marginLeft: 16 }}>
        {formatDate(item.sentAt)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#0F172A" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: "Inter_700Bold", fontSize: 18, color: "#0F172A" }}>
          Posteingang
        </Text>
        {messages.length > 0 && (
          <View style={{ backgroundColor: "#EF1D26", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{messages.length}</Text>
          </View>
        )}
        {messages.length === 0 && <View style={{ width: 26 }} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#EF1D26" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="wifi-off" size={48} color="#CBD5E1" />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: "#64748B", marginTop: 12, textAlign: "center" }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 16, backgroundColor: "#EF1D26", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" }}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="email-open-outline" size={56} color="#CBD5E1" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#64748B", marginTop: 14 }}>Keine Nachrichten</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>
            Hier erscheinen Nachrichten vom ONRODA-Team.
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF1D26" />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
        />
      )}
    </SafeAreaView>
  );
}
