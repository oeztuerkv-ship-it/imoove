import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
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

import { useDriver } from "@/context/DriverContext";
import { getApiBaseUrl } from "@/utils/apiBase";

const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

type Props = {
  /** Nur Owner sieht den FAB. */
  enabled: boolean;
  showFab?: boolean;
  bottomInset?: number;
};

/**
 * Funk-Zuweisung (Owner) — gleicher Einstieg wie Privatauftrag (FAB),
 * aber rot mit offenem Schloss.
 */
export function DriverFunkDispatchSection({
  enabled,
  showFab = true,
  bottomInset = 64,
}: Props) {
  const { driver } = useDriver();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState("Telefonkunde");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [fromFull, setFromFull] = useState("");
  const [toFull, setToFull] = useState("");

  const closeSheet = useCallback(() => {
    setOpen(false);
  }, []);

  const openCreate = useCallback(() => {
    void Haptics.selectionAsync();
    setCustomerName("Telefonkunde");
    setCustomerPhone("");
    setNote("");
    setFromFull("");
    setToFull("");
    setOpen(true);
  }, []);

  const submit = useCallback(async () => {
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
          note: note.trim() || undefined,
          from: from.split(",")[0]?.trim() || from,
          fromFull: from,
          to: to.split(",")[0]?.trim() || to,
          toFull: to,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        funkTimeline?: { summaryLine?: string };
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
        data.funkTimeline?.summaryLine || "Nächstgelegener Fahrer wurde exklusiv angefragt.";
      closeSheet();
      Alert.alert("Funk-Fahrt angelegt", summary);
    } catch {
      Alert.alert("Netzwerkfehler", "Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }, [driver?.authToken, customerName, customerPhone, note, fromFull, toFull, closeSheet]);

  if (!enabled || !driver?.isOwner) return null;

  return (
    <>
      {showFab ? (
        <Pressable
          accessibilityLabel="Funk-Zuweisung"
          onPress={openCreate}
          style={[styles.fab, { bottom: bottomInset }]}
        >
          <Feather name="unlock" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdropTap} onPress={closeSheet} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={styles.funkPill}>
                  <Feather name="unlock" size={14} color="#991B1B" />
                  <Text style={styles.funkPillText}>Funk-Zuweisung</Text>
                </View>
              </View>
              <Pressable onPress={closeSheet} hitSlop={10}>
                <Feather name="x" size={22} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 12 }}
            >
              <Text style={styles.hint}>
                Telefonkunde → nächster verfügbarer Fahrer. Ohne PIN, ohne Abrechnung.
              </Text>

              <Text style={[styles.label, styles.labelFirst]}>Kundenname</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Telefonkunde"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
              />

              <Text style={styles.label}>Telefon (optional)</Text>
              <TextInput
                style={styles.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="Telefonnummer"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Start *</Text>
              <TextInput
                style={styles.input}
                value={fromFull}
                onChangeText={setFromFull}
                placeholder="Abholort"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
              />

              <Text style={styles.label}>Ziel *</Text>
              <TextInput
                style={styles.input}
                value={toFull}
                onChangeText={setToFull}
                placeholder="Zielort"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
              />

              <Text style={styles.label}>Notiz</Text>
              <TextInput
                style={[styles.input, styles.inputArea]}
                value={note}
                onChangeText={(t) => setNote(t.slice(0, 500))}
                placeholder="Kurznotiz für den Fahrer …"
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={500}
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.btnSecondary} onPress={closeSheet} disabled={busy}>
                  <Text style={styles.btnSecondaryText}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
                  onPress={() => void submit()}
                  disabled={busy}
                >
                  <Text style={styles.btnPrimaryText}>
                    {busy ? "Zuweisen …" : "Nächsten Fahrer anfragen"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EF1D26",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 201,
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  funkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  funkPillText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#991B1B",
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
    lineHeight: 18,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
    marginTop: 8,
  },
  labelFirst: { marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#111",
    backgroundColor: "#fff",
  },
  inputArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  btnSecondary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  btnSecondaryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#374151",
  },
  btnPrimary: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#EF1D26",
  },
  btnPrimaryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
