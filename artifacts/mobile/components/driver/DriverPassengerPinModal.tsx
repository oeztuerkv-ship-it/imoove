import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { verifyPassengerPinForRide } from "@/utils/driverVerifyPassengerPinApi";

type Props = {
  visible: boolean;
  rideId: string;
  onClose: () => void;
  onVerified: () => void;
};

export function DriverPassengerPinModal({ visible, rideId, onClose, onVerified }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin("");
      setError(null);
      setBusy(false);
    }
  }, [visible, rideId]);

  const submit = async () => {
    const code = pin.replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) {
      setError("Bitte genau 4 Ziffern eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await verifyPassengerPinForRide(rideId, code);
      if (!outcome.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(outcome.message);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onVerified();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Feather name="shield" size={22} color="#111827" />
            <Text style={styles.title}>Fahrgast-Code</Text>
          </View>
          <Text style={styles.hint}>
            Bitte den 4-stelligen Code vom Fahrgast hier eingeben.
          </Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="••••"
            placeholderTextColor="#9CA3AF"
            editable={!busy}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.7 }]}
              onPress={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Bestätigen</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827" },
  hint: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#4B5563", lineHeight: 20 },
  input: {
    borderWidth: 1.5,
    borderColor: "#111827",
    borderRadius: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    color: "#111827",
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" as const } : null),
  },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#DC2626" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnGhost: { backgroundColor: "#F3F4F6" },
  btnGhostText: { fontFamily: "Inter_600SemiBold", color: "#374151", fontSize: 15 },
  btnPrimary: { backgroundColor: "#16A34A" },
  btnPrimaryText: { fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 15 },
});
