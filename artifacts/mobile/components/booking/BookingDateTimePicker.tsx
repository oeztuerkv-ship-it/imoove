import RNDateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useLayoutEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { accountSheetCardTitle, accountSheetToolbarAction } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

type Colors = ReturnType<typeof useColors>;

/** Lokales Kalenderdatum + Uhrzeit — kein UTC-Mitternacht-Versatz vom Android-Picker. */
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

function clampToMinimum(value: Date, minimumDate: Date): Date {
  return value.getTime() < minimumDate.getTime() ? new Date(minimumDate.getTime()) : value;
}

/**
 * Abholtermin-Picker.
 * iOS: `mode="datetime"` + Spinner im Modal.
 * Android: **kein** `datetime` (nicht unterstützt → Crash) — native Dialoge Datum, dann Uhrzeit.
 *
 * Wichtig: Draft/Floor nur beim **Öffnen** setzen — nicht bei jedem Parent-Re-Render
 * (`minimumDate={new Date(...)}` wäre sonst neue Referenz → Spinner springt zurück auf „heute“).
 */
export function BookingDateTimePicker({
  visible,
  value,
  minimumDate,
  onClose,
  onConfirm,
  colors,
  title = "Abholzeit",
}: {
  visible: boolean;
  value: Date | null;
  minimumDate?: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  colors: Colors;
  title?: string;
}) {
  const valueRef = useRef(value);
  const minimumDatePropRef = useRef(minimumDate);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  valueRef.current = value;
  minimumDatePropRef.current = minimumDate;
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  const [openFloor, setOpenFloor] = useState(() => new Date());
  const [draft, setDraft] = useState(() => new Date());
  const androidOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (!visible) {
      androidOpenRef.current = false;
      return;
    }

    const floor = new Date((minimumDatePropRef.current ?? new Date()).getTime());
    const initial = clampToMinimum(valueRef.current ?? floor, floor);
    setOpenFloor(floor);
    setDraft(initial);

    if (Platform.OS !== "android") return;
    if (androidOpenRef.current) return;
    androidOpenRef.current = true;

    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      minimumDate: floor,
      onChange: (event, datePart) => {
        if (event.type !== "set" || !datePart) {
          androidOpenRef.current = false;
          onCloseRef.current();
          return;
        }
        const timeSeed = mergeDateAndTime(datePart, initial);
        DateTimePickerAndroid.open({
          value: timeSeed,
          mode: "time",
          is24Hour: true,
          onChange: (timeEvent, timePart) => {
            androidOpenRef.current = false;
            if (timeEvent.type !== "set" || !timePart) {
              onCloseRef.current();
              return;
            }
            const merged = clampToMinimum(mergeDateAndTime(datePart, timePart), floor);
            onConfirmRef.current(merged);
            void Haptics.selectionAsync();
          },
        });
      },
    });
  }, [visible]);

  if (Platform.OS === "android") {
    return null;
  }

  const onChange = (_event: DateTimePickerEvent, next?: Date) => {
    if (!next) return;
    // Nicht bei jedem Scroll an den Floor klemmen — sonst springt der Spinner zurück.
    setDraft(next);
  };

  const confirm = () => {
    onConfirm(clampToMinimum(draft, openFloor));
    void Haptics.selectionAsync();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dtModalOverlay} onPress={onClose}>
        <Pressable style={styles.dtModalOverlayInner} onPress={(e) => e.stopPropagation()}>
          <Pressable
            style={[styles.dtModalCard, { backgroundColor: HOME_SHEET_PANEL }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.dtSheetHeader, { borderBottomColor: HOME_SHEET_RIM }]}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={[styles.dtSheetAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
              </Pressable>
              <Text style={[styles.dtSheetTitle, { color: colors.foreground }]}>{title}</Text>
              <Pressable onPress={confirm} hitSlop={10}>
                <Text style={[styles.dtSheetAction, { color: HOME_SHEET_TEXT }]}>Fertig</Text>
              </Pressable>
            </View>
            <RNDateTimePicker
              value={draft}
              mode="datetime"
              display="spinner"
              is24Hour
              locale="de-DE"
              minimumDate={openFloor}
              onChange={onChange}
              style={styles.dtSpinner}
              textColor={colors.foreground}
            />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dtModalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#00000055",
    paddingHorizontal: rs(24),
  },
  dtModalOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  dtModalCard: {
    width: "100%",
    maxWidth: rs(360),
    borderRadius: rs(20),
    paddingBottom: rs(16),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity: 0.15,
    shadowRadius: rs(24),
    elevation: 12,
  },
  dtSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dtSheetTitle: accountSheetCardTitle,
  dtSheetAction: accountSheetToolbarAction,
  dtSpinner: { height: rs(216), alignSelf: "center" },
});
