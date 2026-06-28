import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { accountSheetCardTitle, accountSheetToolbarAction } from "@/constants/accountSheetTypography";
import { HOME_SHEET_PANEL, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

type Colors = ReturnType<typeof useColors>;

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
  const [draft, setDraft] = useState(value ?? minDate);

  useEffect(() => {
    if (visible) setDraft(value && value.getTime() >= minDate.getTime() ? value : minDate);
  }, [visible, value, minDate]);

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
