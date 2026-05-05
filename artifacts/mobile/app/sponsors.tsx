import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDriver } from "@/context/DriverContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rf, rs } from "@/utils/scale";

const API_URL = getApiBaseUrl();

type SponsorItem = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  logoUrl: string | null;
  externalUrl: string | null;
  buttonText: string | null;
  qrCodeUrl: string | null;
  category: string;
};

export default function SponsorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isLoggedIn: isDriverLoggedIn } = useDriver();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SponsorItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setLoading(true);
        try {
          const audience = isDriverLoggedIn ? "driver" : "customer";
          const res = await fetch(`${API_URL}/app/sponsors?audience=${encodeURIComponent(audience)}&limit=10`);
          if (!res.ok || cancelled) return;
          const data = await res.json().catch(() => null);
          if (!data?.ok || !Array.isArray(data.items) || cancelled) return;
          setItems(data.items as SponsorItem[]);
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isDriverLoggedIn]),
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Unterstützer & Sponsoren</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {items.map((it) => (
            <View key={it.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {it.imageUrl ? <Image source={{ uri: it.imageUrl }} style={styles.hero} resizeMode="cover" /> : null}
              <View style={styles.body}>
                {it.logoUrl ? <Image source={{ uri: it.logoUrl }} style={styles.logo} resizeMode="contain" /> : null}
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{it.title}</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{it.description}</Text>
                {it.qrCodeUrl ? <Image source={{ uri: it.qrCodeUrl }} style={styles.qr} resizeMode="contain" /> : null}
                {it.externalUrl ? (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => void WebBrowser.openBrowserAsync(it.externalUrl ?? "")}
                  >
                    <Text style={styles.actionText}>{it.buttonText?.trim() || "Mehr erfahren"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  title: { fontSize: rf(20), fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16, paddingBottom: rs(24), gap: 14 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  hero: { width: "100%", height: rs(150), backgroundColor: "#f1f5f9" },
  body: { padding: 12 },
  logo: { width: 88, height: 44, marginBottom: 8 },
  cardTitle: { fontSize: rf(17), fontFamily: "Inter_700Bold", marginBottom: 6 },
  cardDesc: { fontSize: rf(14), fontFamily: "Inter_400Regular", lineHeight: rf(20), marginBottom: 10 },
  qr: { width: rs(120), height: rs(120), marginBottom: 10, alignSelf: "flex-start" },
  actionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  actionText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
});
