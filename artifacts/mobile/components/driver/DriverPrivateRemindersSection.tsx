import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BookingDateTimePicker } from "@/components/booking/BookingDateTimePicker";
import { useColors } from "@/hooks/useColors";
import {
  createFleetPrivateReminder,
  deleteFleetPrivateReminder,
  listFleetPrivateReminders,
  updateFleetPrivateReminder,
  type FleetPrivateReminder,
} from "@/utils/fleetPrivateRemindersApi";

function defaultScheduledAt(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type FormState = {
  id: string | null;
  scheduledAt: Date;
  fromFull: string;
  toFull: string;
  note: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    scheduledAt: defaultScheduledAt(),
    fromFull: "",
    toFull: "",
    note: "",
  };
}

type Props = {
  enabled: boolean;
};

/**
 * Private Merkliste für Fleet-Inhaber (`is_owner`) — kein Dispatch.
 */
export function DriverPrivateRemindersSection({ enabled }: Props) {
  const colors = useColors();
  const [reminders, setReminders] = useState<FleetPrivateReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setReminders([]);
      return;
    }
    setLoading(true);
    const out = await listFleetPrivateReminders();
    setLoading(false);
    if (out.ok) setReminders(out.reminders);
    else if (out.error !== "owner_required" && out.error !== "taxi_only") {
      /* still usable without toast spam */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (r: FleetPrivateReminder) => {
    const at = new Date(r.scheduledAt);
    setForm({
      id: r.id,
      scheduledAt: Number.isNaN(at.getTime()) ? defaultScheduledAt() : at,
      fromFull: r.fromFull ?? "",
      toFull: r.toFull ?? "",
      note: r.note ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    const fromFull = form.fromFull.trim();
    const toFull = form.toFull.trim();
    const note = form.note.trim();
    if (!fromFull && !toFull && !note) {
      Alert.alert("Notiz", "Bitte Start, Ziel oder Notiz ausfüllen.");
      return;
    }
    setBusy(true);
    const payload = {
      scheduledAt: form.scheduledAt.toISOString(),
      fromFull,
      toFull,
      note,
    };
    const out = form.id
      ? await updateFleetPrivateReminder(form.id, payload)
      : await createFleetPrivateReminder(payload);
    setBusy(false);
    if (!out.ok) {
      Alert.alert("Notiz", "Speichern fehlgeschlagen.");
      return;
    }
    setReminders((prev) => {
      const without = prev.filter((x) => x.id !== out.reminder.id);
      return [...without, out.reminder].sort(
        (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
      );
    });
    setFormOpen(false);
    setForm(emptyForm());
  };

  const onDelete = (r: FleetPrivateReminder) => {
    Alert.alert("Notiz löschen", "Diese private Notiz wirklich löschen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            const out = await deleteFleetPrivateReminder(r.id);
            setBusy(false);
            if (!out.ok) {
              Alert.alert("Notiz", "Löschen fehlgeschlagen.");
              return;
            }
            setReminders((prev) => prev.filter((x) => x.id !== r.id));
            if (form.id === r.id) {
              setFormOpen(false);
              setForm(emptyForm());
            }
          })();
        },
      },
    ]);
  };

  if (!enabled) return null;

  const sorted = [...reminders].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Private Notizen</Text>
          <Text style={styles.headerSub}>Nur für Inhaber — kein Fahrer-Matching</Text>
        </View>
        <Pressable onPress={openCreate} style={styles.addBtn} hitSlop={8}>
          <Feather name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Notiz</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} color="#6366F1" />
      ) : sorted.length === 0 ? (
        <Text style={styles.empty}>Noch keine Notizen. Tippen Sie auf „Notiz“.</Text>
      ) : (
        sorted.map((r) => (
          <Pressable key={r.id} style={styles.card} onPress={() => openEdit(r)}>
            <View style={styles.cardTop}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Notiz</Text>
              </View>
              <Text style={styles.cardTime}>{fmtDateTime(r.scheduledAt)}</Text>
            </View>
            <Text style={styles.cardRoute} numberOfLines={2}>
              {(r.fromFull || "—").trim()} → {(r.toFull || "—").trim()}
            </Text>
            {r.note?.trim() ? (
              <Text style={styles.cardNote} numberOfLines={2}>
                {r.note.trim()}
              </Text>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable onPress={() => openEdit(r)} hitSlop={6}>
                <Text style={styles.link}>Bearbeiten</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(r)} hitSlop={6} disabled={busy}>
                <Text style={[styles.link, { color: "#B91C1C" }]}>Löschen</Text>
              </Pressable>
            </View>
          </Pressable>
        ))
      )}

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{form.id ? "Notiz bearbeiten" : "Private Notiz"}</Text>
            <Text style={styles.modalHint}>Kein Auftrag — nur Merkliste für Ihr Unternehmen.</Text>

            <Text style={styles.label}>Wann</Text>
            <Pressable style={styles.dtField} onPress={() => setPickerOpen(true)}>
              <Feather name="clock" size={16} color="#6B7280" />
              <Text style={styles.dtFieldText}>{fmtDateTime(form.scheduledAt.toISOString())}</Text>
            </Pressable>

            <Text style={styles.label}>Von (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.fromFull}
              onChangeText={(t) => setForm((f) => ({ ...f, fromFull: t }))}
              placeholder="Start / Ort"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Nach (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.toFull}
              onChangeText={(t) => setForm((f) => ({ ...f, toFull: t }))}
              placeholder="Ziel"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Notiz</Text>
            <TextInput
              style={[styles.input, styles.inputArea]}
              value={form.note}
              onChangeText={(t) => setForm((f) => ({ ...f, note: t.slice(0, 2000) }))}
              placeholder="z. B. Rückruf, Stammtisch …"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={2000}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.btnSecondary}
                onPress={() => {
                  setFormOpen(false);
                  setForm(emptyForm());
                }}
                disabled={busy}
              >
                <Text style={styles.btnSecondaryText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={() => void save()} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Speichern</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BookingDateTimePicker
        visible={pickerOpen}
        value={form.scheduledAt}
        colors={colors}
        title="Wann"
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => {
          setForm((f) => ({ ...f, scheduledAt: d }));
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#111827" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#6B7280", marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFFFFF" },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#6B7280", marginBottom: 4 },
  card: {
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderLeftWidth: 3,
    borderLeftColor: "#6366F1",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  badge: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#3730A3" },
  cardTime: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#4B5563" },
  cardRoute: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#111827" },
  cardNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#4B5563", marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 16, marginTop: 10 },
  link: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#4F46E5" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  modalPanel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#111827" },
  modalHint: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#6B7280", marginTop: 4, marginBottom: 14 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#6B7280", marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#111827",
  },
  inputArea: { minHeight: 72, textAlignVertical: "top" },
  dtField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dtFieldText: { fontFamily: "Inter_500Medium", fontSize: 15, color: "#111827" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  btnSecondaryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#374151" },
  btnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    minWidth: 110,
    alignItems: "center",
  },
  btnPrimaryText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" },
});
