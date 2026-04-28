import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar } from "@/components/BottomTabBar";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

export default function BookingQrScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = (typeof window !== "undefined" ? 67 : insets.top) + 10;
  const [code, setCode] = useState("");

  const runCode = () => {
    const c = code.trim();
    if (!c) {
      Alert.alert("Code fehlt", "Bitte QR-/Buchungscode eingeben.");
      return;
    }
    Alert.alert(
      "Code übernommen",
      `Code ${c} wurde übernommen. Nächste Ausbaustufe: QR-Scan + automatische Prüfung (Patient, Genehmigung, Kostenstelle, Nachweise).`,
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>QR-Code / Code einlösen</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>Vorbereitung für automatische Freigabeprüfung.</Text>
        </View>
      </View>
      <View style={{ padding: rs(16), gap: rs(10), paddingBottom: rs(120) }}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Zielbild: QR prüft Zuordnung zum Patienten, Genehmigungsstatus, Kostenstelle und Nachweis-Vollständigkeit.
          </Text>
        </View>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="QR-/Buchungscode eingeben"
          autoCapitalize="characters"
          style={styles.input}
        />
        <Pressable style={styles.primary} onPress={runCode}>
          <Feather name="check" size={16} color="#fff" />
          <Text style={styles.primaryText}>Code prüfen</Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, { borderColor: colors.border }]}
          onPress={() =>
            Alert.alert("Scanner vorbereitet", "Kamera-Scanner wird im nächsten Schritt (expo-camera) angebunden.")
          }
        >
          <Feather name="camera" size={16} color="#0F172A" />
          <Text style={styles.secondaryText}>QR-Code scannen (nächster Schritt)</Text>
        </Pressable>
      </View>
      <BottomTabBar active="buchen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: rs(10), paddingHorizontal: rs(16), paddingBottom: rs(12), borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: rf(19), fontFamily: "Inter_700Bold" },
  sub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 2 },
  infoBox: { borderRadius: rs(10), borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", padding: rs(10) },
  infoText: { color: "#1E3A8A", fontFamily: "Inter_500Medium", fontSize: rf(12), lineHeight: rf(17) },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: rs(10), backgroundColor: "#fff", paddingHorizontal: rs(12), paddingVertical: rs(10), fontFamily: "Inter_500Medium", fontSize: rf(14) },
  primary: { borderRadius: rs(10), backgroundColor: "#7C3AED", paddingVertical: rs(12), alignItems: "center", justifyContent: "center", flexDirection: "row", gap: rs(8) },
  primaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: rf(13) },
  secondary: { borderWidth: 1, borderRadius: rs(10), backgroundColor: "#fff", paddingVertical: rs(11), alignItems: "center", justifyContent: "center", flexDirection: "row", gap: rs(8) },
  secondaryText: { color: "#0F172A", fontFamily: "Inter_600SemiBold", fontSize: rf(13) },
});

