import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDriver } from "@/context/DriverContext";
import { getApiBaseUrl } from "@/utils/apiBase";

const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

type FunkTimelineStep = {
  at: string;
  outcome: string;
  driverId: string | null;
  driverName: string | null;
};

export default function DriverCreateFunkScreen() {
  const insets = useSafeAreaInsets();
  const { driver } = useDriver();
  const [customerName, setCustomerName] = useState("Telefonkunde");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fromFull, setFromFull] = useState("");
  const [toFull, setToFull] = useState("");
  const [busy, setBusy] = useState(false);

  if (!driver?.isOwner) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 16 }}>
          <Feather name="arrow-left" size={24} color="#111" />
        </Pressable>
        <Text style={styles.denied}>Funk-Zuweisung nur für den Inhaber.</Text>
      </View>
    );
  }

  const submit = async () => {
    if (!driver?.authToken) {
      Alert.alert("Nicht angemeldet", "Bitte erneut als Fahrer anmelden.");
      return;
    }
    const from = fromFull.trim();
    const to = toFull.trim();
    if (!from || !to) {
      Alert.alert("Pflichtfelder", "Abholort und Ziel sind erforderlich.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/fleet-driver/v1/rides/funk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${driver.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: customerName.trim() || "Telefonkunde",
          customerPhone: customerPhone.trim() || undefined,
          from: from.split(",")[0]?.trim() || from,
          fromFull: from,
          to: to.split(",")[0]?.trim() || to,
          toFull: to,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        ride?: { id?: string; status?: string; offeredToDriverId?: string };
        funkTimeline?: { summaryLine?: string; steps?: FunkTimelineStep[] };
      };
      if (!res.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        const msg =
          data.message ||
          (code === "no_available_driver"
            ? "Kein verfügbarer ONLINE-Fahrer gefunden."
            : code === "owner_only"
              ? "Nur der Inhaber darf Funk-Fahrten anlegen."
              : code === "from_not_found"
                ? "Abholadresse konnte nicht gefunden werden."
                : code === "to_not_found"
                  ? "Zieladresse konnte nicht gefunden werden."
                  : code || `Fehler (${res.status})`);
        Alert.alert("Funk-Zuweisung fehlgeschlagen", msg);
        return;
      }
      const summary =
        data.funkTimeline?.summaryLine ||
        (data.ride?.status === "offered"
          ? "Nächstgelegener Fahrer wurde exklusiv angefragt."
          : "Funk-Fahrt angelegt.");
      Alert.alert("Funk-Fahrt angelegt", summary, [
        { text: "OK", onPress: () => router.replace("/driver/dashboard") },
      ]);
    } catch {
      Alert.alert("Netzwerkfehler", "Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color="#111" />
        </Pressable>
        <Text style={styles.title}>Funk-Zuweisung</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.hint}>
        Telefonkunde → nächster verfügbarer Fahrer. Ohne PIN, ohne Abrechnung.
      </Text>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Kundenname</Text>
        <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} />
        <Text style={styles.label}>Telefon (optional)</Text>
        <TextInput
          style={styles.input}
          value={customerPhone}
          onChangeText={setCustomerPhone}
          keyboardType="phone-pad"
        />
        <Text style={styles.label}>Abholort *</Text>
        <TextInput
          style={styles.input}
          value={fromFull}
          onChangeText={setFromFull}
          placeholder="Straße, PLZ Ort"
          placeholderTextColor="#9CA3AF"
        />
        <Text style={styles.label}>Ziel *</Text>
        <TextInput
          style={styles.input}
          value={toFull}
          onChangeText={setToFull}
          placeholder="Straße, PLZ Ort"
          placeholderTextColor="#9CA3AF"
        />
        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} onPress={() => void submit()} disabled={busy}>
          <Text style={styles.submitText}>{busy ? "Zuweisen …" : "Nächsten Fahrer anfragen"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#111" },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#6B7280",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  denied: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "#6B7280",
    padding: 24,
    textAlign: "center",
  },
  form: { paddingHorizontal: 16, paddingBottom: 40, gap: 6 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#374151", marginTop: 10 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#111",
  },
  submit: {
    marginTop: 24,
    backgroundColor: "#EF1D26",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
});
