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

function toIsoFromLocalDatetime(local: string): string | null {
  const t = new Date(local);
  if (!Number.isFinite(t.getTime())) return null;
  return t.toISOString();
}

export default function DriverCreateReservationScreen() {
  const insets = useSafeAreaInsets();
  const { driver } = useDriver();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fromFull, setFromFull] = useState("");
  const [toFull, setToFull] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!driver?.authToken) {
      Alert.alert("Nicht angemeldet", "Bitte erneut als Fahrer anmelden.");
      return;
    }
    const name = customerName.trim();
    const from = fromFull.trim();
    const to = toFull.trim();
    if (!name || !from || !to || !scheduledLocal.trim()) {
      Alert.alert("Pflichtfelder", "Kundenname, Abholort, Ziel und Termin sind erforderlich.");
      return;
    }
    const scheduledAt = toIsoFromLocalDatetime(scheduledLocal.trim());
    if (!scheduledAt) {
      Alert.alert("Termin", "Bitte gültiges Datum und Uhrzeit eingeben (z. B. 2026-06-20T14:30).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/fleet-driver/v1/reservations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${driver.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: name,
          customerPhone: customerPhone.trim() || undefined,
          from: from.split(",")[0]?.trim() || from,
          fromFull: from,
          to: to.split(",")[0]?.trim() || to,
          toFull: to,
          scheduledAt,
          paymentMethod,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        const msg =
          code === "scheduled_at_too_soon"
            ? "Reservierung mindestens 60 Minuten im Voraus."
            : code === "driver_not_ready"
              ? "Sie sind noch nicht einsatzbereit."
              : code || `Fehler (${res.status})`;
        Alert.alert("Reservierung fehlgeschlagen", msg);
        return;
      }
      Alert.alert("Reservierung angelegt", "Die Fahrt erscheint unter Bestellungen.", [
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
        <Text style={styles.title}>Reservierung anlegen</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>Walk-in / Telefon — mindestens 60 Minuten Vorlauf.</Text>
        <Text style={styles.label}>Kundenname *</Text>
        <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} />
        <Text style={styles.label}>Telefon (optional)</Text>
        <TextInput
          style={styles.input}
          value={customerPhone}
          onChangeText={setCustomerPhone}
          keyboardType="phone-pad"
        />
        <Text style={styles.label}>Abholort *</Text>
        <TextInput style={styles.input} value={fromFull} onChangeText={setFromFull} />
        <Text style={styles.label}>Ziel *</Text>
        <TextInput style={styles.input} value={toFull} onChangeText={setToFull} />
        <Text style={styles.label}>Termin (ISO lokal) *</Text>
        <TextInput
          style={styles.input}
          value={scheduledLocal}
          onChangeText={setScheduledLocal}
          placeholder="2026-06-20T14:30"
          autoCapitalize="none"
        />
        <Text style={styles.label}>Zahlungsart</Text>
        <View style={styles.payRow}>
          {(["cash", "card", "rechnung"] as const).map((pm) => (
            <Pressable
              key={pm}
              style={[styles.payChip, paymentMethod === pm && styles.payChipActive]}
              onPress={() => setPaymentMethod(pm)}
            >
              <Text style={[styles.payChipText, paymentMethod === pm && styles.payChipTextActive]}>
                {pm === "cash" ? "Bar" : pm === "card" ? "Karte" : "Rechnung"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} onPress={() => void submit()} disabled={busy}>
          <Text style={styles.submitText}>{busy ? "Speichern …" : "Reservierung speichern"}</Text>
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
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111" },
  form: { paddingHorizontal: 16, paddingBottom: 32, gap: 6 },
  hint: { fontSize: 13, color: "#6B7280", marginBottom: 8, fontFamily: "Inter_400Regular" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginTop: 8 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  payRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 12 },
  payChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  payChipActive: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  payChipText: { fontFamily: "Inter_600SemiBold", color: "#374151", fontSize: 13 },
  payChipTextActive: { color: "#DC2626" },
  submit: {
    marginTop: 16,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
});
