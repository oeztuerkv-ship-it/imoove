import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
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
  /** Unterkante FAB = Abstand vom Bildschirmboden (direkt über Tab-Bar). */
  bottomInset?: number;
};

/**
 * Private Merkliste: grünes Plus-FAB über der Bottom-Nav (Aufträge-Tab).
 * Beeinflusst kein Layout im ScrollView (nur absolute Position).
 */
export function DriverPrivateRemindersSection({ enabled, bottomInset = 64 }: Props) {
  const colors = useColors();
  const [reminders, setReminders] = useState<FleetPrivateReminder[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setReminders([]);
      return;
    }
    setLoading(true);
    const out = await listFleetPrivateReminders();
    setLoading(false);
    if (out.ok) setReminders(out.reminders);
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
    setListOpen(true);
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
    <>
      <Pressable
        accessibilityLabel="Private Notiz"
        onPress={() => {
          void load();
          setListOpen(true);
        }}
        style={[styles.fab, { bottom: bottomInset }]}
      >
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>

      <Modal visible={listOpen} animationType="slide" transparent onRequestClose={() => setListOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Private Notizen</Text>
              <Pressable onPress={() => setListOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color="#6B7280" />
              </Pressable>
            </View>

            <Pressable style={styles.newBtn} onPress={openCreate}>
              <Feather name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.newBtnText}>Neue Notiz</Text>
            </Pressable>

            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {loading ? (
                <ActivityIndicator style={{ marginTop: 24 }} color="#22C55E" />
              ) : sorted.length === 0 ? null : (
                sorted.map((r) => {
                  const route = `${(r.fromFull || "—").trim()} → ${(r.toFull || "—").trim()}`;
                  const sub = r.note?.trim()
                    ? `${fmtDateTime(r.scheduledAt)} · ${r.note.trim()}`
                    : fmtDateTime(r.scheduledAt);
                  return (
                    <Pressable
                      key={r.id}
                      style={styles.listRow}
                      onPress={() => openEdit(r)}
                      onLongPress={() => onDelete(r)}
                    >
                      <View style={styles.listRowIcon}>
                        <Feather name="file-text" size={17} color="#111827" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.listRowTitle} numberOfLines={1}>
                          {route}
                        </Text>
                        <Text style={styles.listRowSub} numberOfLines={2}>
                          {sub}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{form.id ? "Notiz bearbeiten" : "Private Notiz"}</Text>

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
              {form.id ? (
                <Pressable
                  style={styles.btnDanger}
                  onPress={() => {
                    const r = reminders.find((x) => x.id === form.id);
                    if (r) onDelete(r);
                  }}
                  disabled={busy}
                >
                  <Text style={styles.btnDangerText}>Löschen</Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
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
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
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
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#111827" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  newBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF" },
  listScroll: { maxHeight: 360 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
  },
  listRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  listRowTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#111827" },
  listRowSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#6B7280", marginTop: 2 },
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
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
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
    backgroundColor: "#22C55E",
    minWidth: 110,
    alignItems: "center",
  },
  btnPrimaryText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" },
  btnDanger: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: "auto",
  },
  btnDangerText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#B91C1C" },
});
