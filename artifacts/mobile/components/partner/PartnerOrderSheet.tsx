import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
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

import { HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import type { PartnerBookMode } from "@/utils/partnerInstantBooking";
import { defaultPartnerReservationTime } from "@/utils/partnerInstantBooking";
import { RESERVATION_LEAD_MS } from "@/utils/partnerScheduling";

const PARTNER_GREEN = "#15803D";
const NOTE_MAX = 200;

type Props = {
  visible: boolean;
  pickupLabel: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (mode: PartnerBookMode, note: string, scheduledAt: string | null) => void;
};

export function PartnerOrderSheet({ visible, pickupLabel, submitting, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
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

  const onPickerChange = (_e: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (value) setReservationAt(value);
  };

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
            <Text style={styles.pickup}>{pickupLabel}</Text>

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
                {Platform.OS === "android" ? (
                  <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
                    <Text style={styles.dateBtnText}>
                      {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
                        reservationAt,
                      )}
                    </Text>
                  </Pressable>
                ) : null}
                {Platform.OS === "ios" || showPicker ? (
                  <DateTimePicker
                    value={reservationAt}
                    mode="datetime"
                    minimumDate={minReservation}
                    onChange={onPickerChange}
                    locale="de-DE"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    style={Platform.OS === "ios" ? { height: 160 } : undefined}
                  />
                ) : null}
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
  pickup: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151", marginBottom: 16, lineHeight: 22 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111",
    textAlignVertical: "top",
  },
  noteCount: { fontSize: 11, color: "#9CA3AF", textAlign: "right", marginTop: 4, marginBottom: 12 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
  },
  modeBtnActive: { borderColor: PARTNER_GREEN, backgroundColor: "rgba(21,128,61,0.08)" },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#9CA3AF",
  },
  radioActive: { borderColor: PARTNER_GREEN, backgroundColor: PARTNER_GREEN },
  modeText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111" },
  reservationBlock: { marginBottom: 8 },
  dateBtn: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    backgroundColor: "#F9FAFB",
  },
  dateBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#111" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#374151" },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: PARTNER_GREEN,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
