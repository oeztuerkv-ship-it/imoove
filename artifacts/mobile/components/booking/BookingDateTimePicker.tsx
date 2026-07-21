import RNDateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { accountSheetCardTitle, accountSheetToolbarAction } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

type Colors = ReturnType<typeof useColors>;

function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  const next = new Date(datePart);
  next.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return next;
}

function clampToMinimum(value: Date, minimumDate: Date): Date {
  return value.getTime() < minimumDate.getTime() ? new Date(minimumDate) : value;
}

/**
 * Abholtermin-Picker.
 * iOS: `mode="datetime"` + Spinner im Modal.
 * Android: **kein** `datetime` (nicht unterstützt → Crash) — native Dialoge Datum, dann Uhrzeit.
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
  const minDate = minimumDate ?? new Date();
  const [draft, setDraft] = useState(() => clampToMinimum(value ?? minDate, minDate));
  const androidOpenRef = useRef(false);
  const valueRef = useRef(value);
  const minDateRef = useRef(minDate);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  valueRef.current = value;
  minDateRef.current = minDate;
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (visible) setDraft(clampToMinimum(value ?? minDate, minDate));
  }, [visible, value, minDate]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!visible) {
      androidOpenRef.current = false;
      return;
    }
    if (androidOpenRef.current) return;
    androidOpenRef.current = true;

    const floor = minDateRef.current;
    const initial = clampToMinimum(valueRef.current ?? floor, floor);

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
        DateTimePickerAndroid.open({
          value: mergeDateAndTime(datePart, initial),
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
    if (next) setDraft(next);
  };

  const confirm = () => {
    onConfirm(clampToMinimum(draft, minDate));
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
              minimumDate={minDate}
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
