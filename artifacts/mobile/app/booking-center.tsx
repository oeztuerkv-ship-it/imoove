import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar } from "@/components/BottomTabBar";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

type BookingCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
};

export default function BookingCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = (typeof window !== "undefined" ? 67 : insets.top) + 10;

  const cards: BookingCard[] = [
    {
      key: "instant",
      title: "Sofortfahrt",
      subtitle: "Direkt starten, Fahrer wird sofort gesucht.",
      icon: "zap",
      color: "#DC2626",
      onPress: () => router.push("/"),
    },
    {
      key: "reserve",
      title: "Reservierung",
      subtitle: "Fahrt für später planen (Datum/Uhrzeit).",
      icon: "calendar",
      color: "#2563EB",
      onPress: () => router.push("/new-booking"),
    },
    {
      key: "medical",
      title: "Krankenfahrt",
      subtitle: "Fahrtrelevante Angaben ohne Diagnose speichern.",
      icon: "heart",
      color: "#0EA5E9",
      onPress: () => router.push("/booking-medical"),
    },
    {
      key: "series",
      title: "Serienfahrt",
      subtitle: "Wiederkehrende Krankenfahrten über Zeitraum anlegen.",
      icon: "repeat",
      color: "#16A34A",
      onPress: () => router.push("/booking-medical?mode=series"),
    },
    {
      key: "qr",
      title: "QR-Code / Code einlösen",
      subtitle: "Genehmigung/Buchung aufrufen und später automatisch prüfen.",
      icon: "maximize",
      color: "#7C3AED",
      onPress: () => router.push("/booking-qr"),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Buchungszentrale</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Wähle den passenden Buchungsweg für deine Fahrt.
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: rs(16), gap: rs(12), paddingBottom: rs(110) }}>
        {cards.map((c) => (
          <Pressable
            key={c.key}
            onPress={c.onPress}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${c.color}20` }]}>
              <Feather name={c.icon} size={20} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.title}</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{c.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
        <View style={[styles.notice, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color="#166534" />
          <Text style={styles.noticeText}>
            ONRODA speichert nur fahrtrelevante Daten für Disposition, Nachweis und Abrechnung.
          </Text>
        </View>
      </ScrollView>
      <BottomTabBar active="buchen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: rs(18), paddingBottom: rs(12), borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: rf(22), fontFamily: "Inter_700Bold" },
  sub: { fontSize: rf(13), fontFamily: "Inter_400Regular", marginTop: rs(4) },
  card: {
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
  },
  iconWrap: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: rf(15), fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: rf(17) },
  notice: { borderRadius: rs(12), borderWidth: 1, padding: rs(12), flexDirection: "row", gap: rs(10), alignItems: "flex-start" },
  noticeText: { flex: 1, color: "#166534", fontSize: rf(12), fontFamily: "Inter_500Medium", lineHeight: rf(17) },
});

