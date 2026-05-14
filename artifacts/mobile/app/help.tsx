import { Feather } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BottomTabBar,
  BOTTOM_TAB_BAR_HOME_OFFSET_Y,
  tabMainScreenScrollPaddingBottom,
} from "@/components/BottomTabBar";
import { SectionHeadingPill } from "@/components/SectionHeadingPill";
import { accountSheetPrimaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

const SUPPORT_EMAIL = "onroda@mail.de";

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
    a: "Der Preis hängt von Strecke, Fahrzeugtyp und den örtlich gültigen Tarifen ab. Den konkreten Betrag sehen Sie in der App bei der Buchung vor der Bestätigung — feste Euro-Werte nennen wir hier nicht, weil die Preise je nach Region variieren können.",
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
    a: "Schreiben Sie uns an onroda@mail.de — wir melden uns schnellstmöglich.",
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
        <Text style={[accountSheetPrimaryLabel, styles.faqQ, { color: colors.foreground }]}>{q}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={rs(17)} color={colors.mutedForeground} />
      </View>
      {open && (
        <View
          style={{
            backgroundColor: HOME_SHEET_INNER,
            borderRadius: rs(10),
            paddingVertical: rs(10),
            paddingHorizontal: rs(12),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: HOME_SHEET_RIM,
          }}
        >
          <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{a}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            borderBottomColor: HOME_SHEET_RIM,
            backgroundColor: HOME_SHEET_PANEL,
          },
        ]}
      >
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hilfe</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) },
        ]}
      >
        <View
          style={[
            styles.contactBanner,
            { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 },
          ]}
        >
          <Feather name="mail" size={rs(17)} color="#16A34A" />
          <View style={styles.contactInfo}>
            <Text style={[styles.contactTitle, { color: colors.foreground }]}>Kontakt</Text>
            <View style={styles.contactEmailRow}>
              <Text style={[styles.contactSub, { color: colors.mutedForeground, flexShrink: 1 }]} selectable>
                {SUPPORT_EMAIL}
              </Text>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="E-Mail-Adresse kopieren"
                onPress={async () => {
                  try {
                    await ExpoClipboard.setStringAsync(SUPPORT_EMAIL);
                    if (Platform.OS !== "web") {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  } catch {
                    Alert.alert("Kopieren", "Die Adresse konnte nicht in die Zwischenablage kopiert werden.");
                  }
                }}
                style={({ pressed }) => [styles.contactCopyBtn, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Feather name="copy" size={rs(15)} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <SectionHeadingPill label="Häufige Fragen" />
          <View
            style={[
              styles.faqCard,
              { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 },
            ]}
          >
            {FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </View>
        </View>
      </ScrollView>

      <BottomTabBar active="hilfe" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: rs(8), paddingTop: rs(24), gap: rs(10) },
  contactBanner: {
    borderRadius: rs(16),
    padding: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(14),
  },
  contactInfo: { gap: 2, flex: 1, minWidth: 0 },
  contactTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  contactEmailRow: { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(2) },
  contactSub: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
  contactCopyBtn: { padding: rs(4), justifyContent: "center", alignItems: "center" },
  content: { gap: rs(10), paddingBottom: rs(16) },
  faqCard: { borderRadius: rs(16), overflow: "hidden" },
  faqItem: { padding: rs(16), borderBottomWidth: StyleSheet.hairlineWidth, gap: rs(8) },
  faqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: rs(10) },
  faqQ: { flex: 1 },
  faqA: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },
});
