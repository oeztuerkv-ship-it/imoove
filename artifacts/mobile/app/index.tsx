import { Stack, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OnrodaOrMark } from "@/components/OnrodaOrMark";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";

/**
 * Zwischenstand: keine Buchungs-Startseite. Minimale Navigation, damit die App nicht „leer“ wirkt.
 */
export default function HomePlaceholderScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <OnrodaOrMark size={72} />
        <Text style={styles.title}>Onroda</Text>
        <Text style={styles.hint}>Startseite folgt. Bis dahin:</Text>

        <Pressable style={styles.btnPrimary} onPress={() => router.push("/profile")}>
          <Text style={styles.btnPrimaryText}>Konto & Anmeldung</Text>
        </Pressable>

        <Pressable style={styles.btnSecondary} onPress={() => router.push("/my-rides")}>
          <Text style={styles.btnSecondaryText}>Meine Fahrten</Text>
        </Pressable>

        <Pressable style={styles.btnSecondary} onPress={() => router.push("/driver/login")}>
          <Text style={styles.btnSecondaryText}>Fahrer-Login</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  center: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  title: { fontSize: 26, fontWeight: "700", marginTop: 8 },
  hint: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  btnPrimary: {
    alignSelf: "stretch",
    backgroundColor: "#111",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnSecondary: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnSecondaryText: { color: ONRODA_MARK_RED, fontSize: 15, fontWeight: "600" },
});
