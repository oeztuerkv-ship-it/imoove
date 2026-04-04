import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const FAQ = [
  {
    q: "Wie buche ich eine Fahrt?",
    a: "Geben Sie Ihren Startpunkt und Ihr Ziel ein, wählen Sie ein Fahrzeug und tippen Sie auf 'Fahrt anfragen'.",
  },
  {
    q: "Kann ich eine Fahrt im Voraus buchen?",
    a: "Ja! Tippen Sie auf das Kalender-Symbol neben 'Fahrt anfragen' und wählen Sie Datum und Uhrzeit.",
  },
  {
    q: "Welche Zahlungsmethoden gibt es?",
    a: "Sie können bar bezahlen, PayPal nutzen oder mit Kreditkarte zahlen. Die Zahlungsart wählen Sie vor der Buchung.",
  },
  {
    q: "Wie wird der Preis berechnet?",
    a: "Grundgebühr 4,30 €, dann 3,00 €/km für die ersten 4 km und 2,50 €/km ab 4 km. Premium: ×1,4 · XL: ×1,6.",
  },
  {
    q: "Kann ich eine Fahrt stornieren?",
    a: "Ja, auf dem Fahrt-Statusbildschirm können Sie die Fahrt jederzeit stornieren.",
  },
  {
    q: "Wie ändere ich meine persönlichen Daten?",
    a: "Tippen Sie oben rechts auf das Profil-Symbol, dann auf 'Persönliche Informationen'.",
  },
  {
    q: "Wie kontaktiere ich den Support?",
    a: "Sie erreichen uns unter support@imoove.de oder telefonisch unter 0711 / 24 24 24.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      style={[styles.faqItem, { borderBottomColor: colors.border }]}
      onPress={() => setOpen((v) => !v)}
    >
      <View style={styles.faqRow}>
        <Text style={[styles.faqQ, { color: colors.foreground }]}>{q}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
      </View>
      {open && (
        <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{a}</Text>
      )}
    </Pressable>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hilfe & FAQ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Contact banner */}
        <View style={[styles.contactBanner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "44" }]}>
          <Feather name="phone" size={20} color={colors.primary} />
          <View style={styles.contactInfo}>
            <Text style={[styles.contactTitle, { color: colors.foreground }]}>
              24/7 Erreichbar
            </Text>
            <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>
              0711 / 24 24 24 · support@imoove.de
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Häufige Fragen</Text>
          <View style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  contactBanner: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  contactInfo: { gap: 2 },
  contactTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  content: { paddingHorizontal: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  faqCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  faqItem: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  faqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  faqA: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
