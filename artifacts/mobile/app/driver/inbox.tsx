import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import {
  dismissDriverAdminMessageId,
  DriverAdminMessage,
  loadDismissedDriverAdminMessageIds,
} from "@/utils/driverAdminMessages";

const API_BASE = getApiBaseUrl();

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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
      const items: DriverAdminMessage[] = Array.isArray(data.items) ? data.items : [];
      setMessages(items);
    } catch (e) {
      setError("Nachrichten konnten nicht geladen werden.");
    }
  }, [driver?.authToken]);

  const loadDismissed = useCallback(async () => {
    const set = await loadDismissedDriverAdminMessageIds();
    setDismissed(set);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMessages(), loadDismissed()]);
    setLoading(false);
  }, [fetchMessages, loadDismissed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchMessages(), loadDismissed()]);
    setRefreshing(false);
  }, [fetchMessages, loadDismissed]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDismiss = useCallback(async (id: string) => {
    await dismissDriverAdminMessageId(id);
    setDismissed((prev) => new Set([...prev, id]));
  }, []);

  const unread = messages.filter((m) => !dismissed.has(m.id));
  const read = messages.filter((m) => dismissed.has(m.id));

  const renderItem = ({ item }: { item: DriverAdminMessage }) => {
    const isRead = dismissed.has(item.id);
    return (
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
          opacity: isRead ? 0.6 : 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          {!isRead && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#EF1D26",
                marginRight: 8,
              }}
            />
          )}
          <Text
            style={{
              flex: 1,
              fontFamily: "Inter_700Bold",
              fontSize: 15,
              color: "#0F172A",
            }}
          >
            {item.title}
          </Text>
          {!isRead && (
            <TouchableOpacity
              onPress={() => handleDismiss(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={22} color="#15803D" />
            </TouchableOpacity>
          )}
        </View>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: "#334155",
            lineHeight: 20,
            marginBottom: 8,
          }}
        >
          {item.body}
        </Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#94A3B8" }}>
          {formatDate(item.sentAt)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#F2F2F7",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#0F172A" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "Inter_700Bold",
            fontSize: 18,
            color: "#0F172A",
          }}
        >
          Posteingang
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#EF1D26" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="wifi-off" size={48} color="#CBD5E1" />
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: "#64748B", marginTop: 12, textAlign: "center" }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={load}
            style={{
              marginTop: 16,
              backgroundColor: "#EF1D26",
              borderRadius: 10,
              paddingHorizontal: 24,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" }}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="email-open-outline" size={56} color="#CBD5E1" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#64748B", marginTop: 14 }}>
            Keine Nachrichten
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>
            Hier erscheinen Nachrichten vom ONRODA-Team.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...unread, ...read]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF1D26" />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
          ListHeaderComponent={
            unread.length > 0 ? (
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 12,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginHorizontal: 16,
                  marginBottom: 8,
                  marginTop: 4,
                }}
              >
                Ungelesen ({unread.length})
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
