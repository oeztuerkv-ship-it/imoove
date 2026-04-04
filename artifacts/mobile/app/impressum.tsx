import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoLine}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function ImpressumScreen() {
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Impressum</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Section title="Angaben gemäß § 5 TMG">
            <InfoLine label="Unternehmen" value="Imoove GmbH" />
            <InfoLine label="Straße" value="Musterstraße 1" />
            <InfoLine label="PLZ / Ort" value="73728 Esslingen am Neckar" />
            <InfoLine label="Land" value="Deutschland" />
          </Section>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Section title="Kontakt">
            <InfoLine label="Telefon" value="+49 711 24 24 24" />
            <InfoLine label="E-Mail" value="info@imoove.de" />
            <InfoLine label="Website" value="www.imoove.de" />
          </Section>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Section title="Handelsregister">
            <InfoLine label="Registergericht" value="Amtsgericht Stuttgart" />
            <InfoLine label="Registernummer" value="HRB 12345" />
            <InfoLine label="USt-IdNr." value="DE123456789" />
          </Section>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Section title="Verantwortlich">
            <InfoLine label="Name" value="Max Mustermann" />
            <InfoLine label="Funktion" value="Geschäftsführer" />
          </Section>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Section title="Datenschutz">
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              Die Nutzung unserer App ist in der Regel ohne Angabe personenbezogener Daten möglich. Soweit auf unseren Seiten personenbezogene Daten erhoben werden, erfolgt dies stets auf freiwilliger Basis.
            </Text>
          </Section>
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
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.3, marginBottom: 2 },
  infoLine: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1, textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth },
  bodyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
