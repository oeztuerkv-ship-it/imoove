import { Feather } from "@expo/vector-icons";
import RNDateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
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

import { useColors } from "@/hooks/useColors";
import {
  createFleetPrivateReminder,
  deleteFleetPrivateReminder,
  listFleetPrivateReminders,
  updateFleetPrivateReminder,
  type FleetPrivateReminder,
} from "@/utils/fleetPrivateRemindersApi";
import {
  cancelPrivateReminderNotification,
  syncPrivateReminderNotifications,
} from "@/utils/privateReminderLocalNotifications";

function defaultScheduledAt(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    timePart.getHours(),
    timePart.getMinutes(),
    0,
    0,
  );
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

export type DriverPrivateRemindersHandle = {
  openCreate: () => void;
  openEdit: (reminder: FleetPrivateReminder) => void;
  openEditById: (reminderId: string) => Promise<void>;
  markComplete: (reminderId: string) => Promise<boolean>;
  reload: () => Promise<void>;
};

type Props = {
  enabled: boolean;
  bottomInset?: number;
  /** Plus-FAB nur auf Aufträge-Tab. */
  showFab?: boolean;
  /** Sync list to parent (Angenommen-Tab + Tab-Badge). */
  onRemindersChange?: (reminders: FleetPrivateReminder[]) => void;
};

/**
 * Interne Abhol-Notizen — FAB + Formular.
 * Gespeicherte Einträge erscheinen unter Aufträge → Angenommen (Badge „Privat“).
 */
export const DriverPrivateRemindersSection = forwardRef<DriverPrivateRemindersHandle, Props>(
  function DriverPrivateRemindersSection(
    { enabled, bottomInset = 64, showFab = true, onRemindersChange },
    ref,
  ) {
    const colors = useColors();
    const [reminders, setReminders] = useState<FleetPrivateReminder[]>([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<FormState>(() => emptyForm());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const remindersRef = useRef(reminders);
    remindersRef.current = reminders;

    const publish = useCallback(
      (next: FleetPrivateReminder[]) => {
        const sorted = [...next].sort(
          (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt),
        );
        setReminders(sorted);
        onRemindersChange?.(sorted);
        void syncPrivateReminderNotifications(sorted);
      },
      [onRemindersChange],
    );

    const load = useCallback(async () => {
      if (!enabled) {
        publish([]);
        return;
      }
      const out = await listFleetPrivateReminders();
      if (out.ok) {
        publish(out.reminders);
      } else if (out.error === "taxi_only") {
        publish([]);
        Alert.alert("Privatauftrag", "Nur für Taxi-Fahrer verfügbar.");
      } else if (out.error !== "load_failed" && out.error !== "network_error") {
        Alert.alert("Privatauftrag", `Laden fehlgeschlagen (${out.error}).`);
      }
    }, [enabled, publish]);

    useEffect(() => {
      void load();
    }, [load]);

    const openCreate = useCallback(() => {
      setForm(emptyForm());
      setPickerOpen(false);
      setOpen(true);
    }, []);

    const openEdit = useCallback((r: FleetPrivateReminder) => {
      const at = new Date(r.scheduledAt);
      setPickerOpen(false);
      setForm({
        id: r.id,
        scheduledAt: Number.isNaN(at.getTime()) ? defaultScheduledAt() : at,
        fromFull: r.fromFull ?? "",
        toFull: r.toFull ?? "",
        note: r.note ?? "",
      });
      setOpen(true);
    }, []);

    const openEditById = useCallback(
      async (reminderId: string) => {
        const id = reminderId.trim();
        if (!id) return;
        let r = remindersRef.current.find((x) => x.id === id);
        if (!r) {
          await load();
          r = remindersRef.current.find((x) => x.id === id);
        }
        if (r && !r.completedAt) openEdit(r);
      },
      [load, openEdit],
    );

    const markComplete = useCallback(
      async (reminderId: string): Promise<boolean> => {
        const id = reminderId.trim();
        if (!id) return false;
        const out = await updateFleetPrivateReminder(id, { completed: true });
        if (!out.ok) {
          Alert.alert("Privatauftrag", "Konnte nicht als erledigt markieren.");
          return false;
        }
        publish(
          remindersRef.current.map((x) => (x.id === id ? out.reminder : x)),
        );
        void cancelPrivateReminderNotification(id);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (form.id === id) {
          setOpen(false);
          setPickerOpen(false);
          setForm(emptyForm());
        }
        return true;
      },
      [publish, form.id],
    );

    useImperativeHandle(
      ref,
      () => ({
        openCreate,
        openEdit,
        openEditById,
        markComplete,
        reload: load,
      }),
      [openCreate, openEdit, openEditById, markComplete, load],
    );

    const closeSheet = () => {
      setOpen(false);
      setPickerOpen(false);
      setForm(emptyForm());
    };

    const openDateTimePicker = useCallback(() => {
      void Haptics.selectionAsync();
      if (Platform.OS === "android") {
        const initial = form.scheduledAt;
        DateTimePickerAndroid.open({
          value: initial,
          mode: "date",
          onChange: (event, datePart) => {
            if (event.type !== "set" || !datePart) return;
            DateTimePickerAndroid.open({
              value: mergeDateAndTime(datePart, initial),
              mode: "time",
              is24Hour: true,
              onChange: (timeEvent, timePart) => {
                if (timeEvent.type !== "set" || !timePart) return;
                setForm((f) => ({ ...f, scheduledAt: mergeDateAndTime(datePart, timePart) }));
                void Haptics.selectionAsync();
              },
            });
          },
        });
        return;
      }
      setPickerOpen((v) => !v);
    }, [form.scheduledAt]);

    const onIosPickerChange = useCallback((_event: DateTimePickerEvent, next?: Date) => {
      if (!next) return;
      setForm((f) => ({ ...f, scheduledAt: next }));
    }, []);

    const save = async () => {
      const fromFull = form.fromFull.trim();
      const toFull = form.toFull.trim();
      const note = form.note.trim();
      if (!fromFull && !toFull && !note) {
        Alert.alert("Privatauftrag", "Bitte Start, Ziel oder Notiz ausfüllen.");
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
        const hint =
          out.error === "taxi_only"
            ? "Nur für Taxi-Fahrer."
            : out.error === "network_error"
              ? "Keine Verbindung."
              : `Speichern fehlgeschlagen (${out.error}).`;
        Alert.alert("Privatauftrag", hint);
        return;
      }
      const without = reminders.filter((x) => x.id !== out.reminder.id);
      publish([...without, out.reminder]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeSheet();
    };

    const onDeleteCurrent = () => {
      if (!form.id) return;
      const id = form.id;
      Alert.alert("Löschen", "Diesen Eintrag löschen?", [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              const out = await deleteFleetPrivateReminder(id);
              setBusy(false);
              if (!out.ok) {
                Alert.alert("Privatauftrag", "Löschen fehlgeschlagen.");
                return;
              }
              publish(reminders.filter((x) => x.id !== id));
              void cancelPrivateReminderNotification(id);
              closeSheet();
            })();
          },
        },
      ]);
    };

    if (!enabled) return null;

    return (
      <>
        {showFab ? (
          <Pressable
            accessibilityLabel="Privatauftrag"
            onPress={openCreate}
            style={[styles.fab, { bottom: bottomInset }]}
          >
            <Feather name="lock" size={22} color="#FFFFFF" />
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
                  <View style={styles.privatPill}>
                    <Feather name="lock" size={14} color="#166534" />
                    <Text style={styles.privatPillText}>
                      {form.id ? "Privatauftrag bearbeiten" : "Privatauftrag"}
                    </Text>
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
                <Text style={[styles.label, styles.labelFirst]}>Start</Text>
                <TextInput
                  style={styles.input}
                  value={form.fromFull}
                  onChangeText={(t) => setForm((f) => ({ ...f, fromFull: t }))}
                  placeholder="Abholort"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                />

                <Text style={styles.label}>Ziel</Text>
                <TextInput
                  style={styles.input}
                  value={form.toFull}
                  onChangeText={(t) => setForm((f) => ({ ...f, toFull: t }))}
                  placeholder="Zielort"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                />

                <Text style={styles.label}>Notiz</Text>
                <TextInput
                  style={[styles.input, styles.inputArea]}
                  value={form.note}
                  onChangeText={(t) => setForm((f) => ({ ...f, note: t.slice(0, 2000) }))}
                  placeholder="Kurznotiz …"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  maxLength={2000}
                />

                <Text style={styles.label}>Datum / Zeit</Text>
                <Pressable style={styles.dtField} onPress={openDateTimePicker}>
                  <Feather name="clock" size={16} color="#6B7280" />
                  <Text style={styles.dtFieldText}>{fmtDateTime(form.scheduledAt.toISOString())}</Text>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color="#9CA3AF"
                    style={{ marginLeft: "auto" }}
                  />
                </Pressable>
                <Text style={styles.hint}>Erinnerung 1 Std. vorher auf diesem Gerät</Text>
                {Platform.OS === "ios" && pickerOpen ? (
                  <View style={styles.inlinePicker}>
                    <RNDateTimePicker
                      value={form.scheduledAt}
                      mode="datetime"
                      display="spinner"
                      is24Hour
                      locale="de-DE"
                      onChange={onIosPickerChange}
                      style={styles.dtSpinner}
                      textColor={colors.foreground}
                    />
                    <Pressable
                      style={styles.pickerDone}
                      onPress={() => {
                        setPickerOpen(false);
                        void Haptics.selectionAsync();
                      }}
                    >
                      <Text style={styles.pickerDoneText}>Fertig</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  {form.id ? (
                    <Pressable style={styles.btnDanger} onPress={onDeleteCurrent} disabled={busy}>
                      <Text style={styles.btnDangerText}>Löschen</Text>
                    </Pressable>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Pressable style={styles.btnSecondary} onPress={closeSheet} disabled={busy}>
                    <Text style={styles.btnSecondaryText}>Beenden</Text>
                  </Pressable>
                  <Pressable style={styles.btnPrimary} onPress={() => void save()} disabled={busy}>
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Speichern</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  },
);

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
  privatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  privatPillText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#166534",
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
    paddingVertical: 9,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "#111827",
  },
  inputArea: { minHeight: 52, textAlignVertical: "top" },
  dtField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#22C55E",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#F3F4F6",
  },
  dtFieldText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#111827", flex: 1 },
  hint: {
    marginTop: 6,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#6B7280",
  },
  inlinePicker: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  dtSpinner: { height: 180, alignSelf: "center" },
  pickerDone: {
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  pickerDoneText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#22C55E" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
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
    borderWidth: 1.5,
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  btnDangerText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#B91C1C" },
});
