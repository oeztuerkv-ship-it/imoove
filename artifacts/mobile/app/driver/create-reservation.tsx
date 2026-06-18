import { Feather } from "@expo/vector-icons";
import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
const RESERVATION_LEAD_MS = 60 * 60 * 1000;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatDateTime(d: Date) {
  const datePart = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  return `${datePart}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

function defaultScheduledAt(): Date {
  const d = new Date(Date.now() + RESERVATION_LEAD_MS);
  d.setSeconds(0, 0);
  const roundedMinutes = Math.ceil(d.getMinutes() / 15) * 15;
  if (roundedMinutes >= 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(roundedMinutes);
  }
  return d;
}

function ReservationDateTimePicker({
  visible,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const minDate = useMemo(() => new Date(Date.now() + RESERVATION_LEAD_MS), [visible]);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const onChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (next) setDraft(next);
  };

  const confirm = () => {
    onConfirm(draft);
    Haptics.selectionAsync();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dtModalOverlay} onPress={onClose}>
        <Pressable style={styles.dtModalOverlayInner} onPress={(e) => e.stopPropagation()}>
          <Pressable style={styles.dtModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dtSheetHeader}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.dtSheetActionMuted}>Abbrechen</Text>
              </Pressable>
              <Text style={styles.dtSheetTitle}>Abholtermin</Text>
              <Pressable onPress={confirm} hitSlop={10}>
                <Text style={styles.dtSheetAction}>Fertig</Text>
              </Pressable>
            </View>
            <RNDateTimePicker
              value={draft}
              mode="datetime"
              display="spinner"
              is24Hour
              locale="de-DE"
              minimumDate={minDate}
              onChange={onChange}
              style={styles.dtSpinner}
              textColor="#111827"
            />
            <Text style={styles.dtPickerHint}>Mindestens 60 Minuten im Voraus</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DriverCreateReservationScreen() {
  const insets = useSafeAreaInsets();
  const { driver } = useDriver();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fromFull, setFromFull] = useState("");
  const [toFull, setToFull] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date>(() => defaultScheduledAt());
  const [showDtPicker, setShowDtPicker] = useState(false);
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
    if (!name || !from || !to) {
      Alert.alert("Pflichtfelder", "Kundenname, Abholort und Ziel sind erforderlich.");
      return;
    }
    if (scheduledAt.getTime() < Date.now() + RESERVATION_LEAD_MS) {
      Alert.alert("Termin", "Reservierung mindestens 60 Minuten im Voraus.");
      return;
    }
    const scheduledAtIso = scheduledAt.toISOString();
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
          scheduledAt: scheduledAtIso,
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
        <Text style={styles.label}>Abholtermin *</Text>
        <Pressable
          style={styles.dtField}
          onPress={() => {
            Haptics.selectionAsync();
            setShowDtPicker(true);
          }}
        >
          <View style={styles.dtFieldIcon}>
            <Feather name="calendar" size={18} color="#DC2626" />
          </View>
          <Text style={styles.dtFieldText}>{formatDateTime(scheduledAt)}</Text>
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        </Pressable>
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
      <ReservationDateTimePicker
        visible={showDtPicker}
        value={scheduledAt}
        onClose={() => setShowDtPicker(false)}
        onConfirm={(d) => {
          setScheduledAt(d);
          setShowDtPicker(false);
        }}
      />
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
  dtField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  dtFieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  dtFieldText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827" },
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
  dtModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    justifyContent: "flex-end",
  },
  dtModalOverlayInner: { flex: 1, justifyContent: "flex-end" },
  dtModalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  dtSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  dtSheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827" },
  dtSheetAction: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  dtSheetActionMuted: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  dtSpinner: { height: 216, alignSelf: "center" },
  dtPickerHint: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 4,
    paddingHorizontal: 16,
  },
});
