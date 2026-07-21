import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingDateTimePicker } from "@/components/booking/BookingDateTimePicker";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import type { PartnerBookMode } from "@/utils/partnerInstantBooking";
import { defaultPartnerReservationTime } from "@/utils/partnerInstantBooking";
import { RESERVATION_LEAD_MS } from "@/utils/partnerScheduling";

const PARTNER_GREEN = "#15803D";
const NOTE_MAX = 200;

type Props = {
  visible: boolean;
  fromLabel: string;
  toLabel: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (mode: PartnerBookMode, note: string, scheduledAt: string | null) => void;
};

export function PartnerOrderSheet({ visible, fromLabel, toLabel, submitting, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [mode, setMode] = useState<PartnerBookMode>("now");
  const [note, setNote] = useState("");
  const [reservationAt, setReservationAt] = useState(() => defaultPartnerReservationTime());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setMode("now");
      setNote("");
      setReservationAt(defaultPartnerReservationTime());
      setShowPicker(false);
    }
  }, [visible]);

  const handleConfirm = () => {
    const scheduledAt = mode === "reservation" ? reservationAt.toISOString() : null;
    onConfirm(mode, note.trim(), scheduledAt);
  };

  const minReservation = new Date(Date.now() + RESERVATION_LEAD_MS);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, paddingBottom: insets.bottom + 16 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.title}>Jetzt bestellen?</Text>
            <Text style={styles.routeLabel}>Start</Text>
            <Text style={styles.routeValue}>{fromLabel}</Text>
            <Text style={styles.routeLabel}>Ziel</Text>
            <Text style={[styles.routeValue, { marginBottom: 16 }]}>{toLabel}</Text>

            <Text style={styles.fieldLabel}>Notiz (optional)</Text>
            <TextInput
              style={[styles.noteInput, { borderColor: HOME_SHEET_RIM }]}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
              placeholder="z. B. Eingang Haupttür"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={NOTE_MAX}
            />
            <Text style={styles.noteCount}>{note.length}/{NOTE_MAX}</Text>

            <Text style={styles.fieldLabel}>Zeitpunkt</Text>
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === "now" && styles.modeBtnActive]}
                onPress={() => setMode("now")}
              >
                <View style={[styles.radio, mode === "now" && styles.radioActive]} />
                <Text style={styles.modeText}>Jetzt</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === "reservation" && styles.modeBtnActive]}
                onPress={() => setMode("reservation")}
              >
                <View style={[styles.radio, mode === "reservation" && styles.radioActive]} />
                <Text style={styles.modeText}>Reservierung</Text>
              </Pressable>
            </View>

            {mode === "reservation" ? (
              <View style={styles.reservationBlock}>
                <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
                  <Text style={styles.dateBtnText}>
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
                      reservationAt,
                    )}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, submitting && { opacity: 0.85 }]}
                onPress={handleConfirm}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Taxi bestellen</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <BookingDateTimePicker
        visible={showPicker}
        value={reservationAt}
        minimumDate={minReservation}
        title="Abholtermin"
        onClose={() => setShowPicker(false)}
        onConfirm={(d) => {
          setReservationAt(d);
          setShowPicker(false);
        }}
        colors={colors}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  keyboard: { justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111", marginBottom: 8 },
  routeLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  routeValue: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151", marginBottom: 10, lineHeight: 22 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
    marginBottom: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111",
    textAlignVertical: "top",
  },
  noteCount: {
    alignSelf: "flex-end",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 12,
  },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  modeBtnActive: { borderColor: PARTNER_GREEN, backgroundColor: "#F0FDF4" },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  radioActive: { borderColor: PARTNER_GREEN, backgroundColor: PARTNER_GREEN },
  modeText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111" },
  reservationBlock: { marginBottom: 12 },
  dateBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  dateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", color: "#6B7280", fontSize: 15 },
  confirmBtn: {
    flex: 1.2,
    borderRadius: 12,
    backgroundColor: PARTNER_GREEN,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { fontFamily: "Inter_700Bold", color: "#fff", fontSize: 15 },
});
