import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  title: string;
  disclaimer?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Scrollbares Bottom-Sheet für Medical-Scan-Ergebnisse (Test + Fahrt). */
export function MedicalScanResultSheet({ visible, title, disclaimer, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const maxSheetHeight = Math.round(windowHeight * 0.9);
  const headerBlockHeight = disclaimer?.trim() ? 118 : 58;
  const scrollMaxHeight = maxSheetHeight - headerBlockHeight - Math.max(insets.bottom, 16) - 14;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Schließen" />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: maxSheetHeight,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Ergebnis schließen"
            >
              <Feather name="x" size={22} color="#475569" />
            </Pressable>
          </View>

          {disclaimer?.trim() ? <Text style={styles.disclaimer}>{disclaimer.trim()}</Text> : null}

          <ScrollView
            style={[styles.scroll, { maxHeight: Math.max(scrollMaxHeight, 220) }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            bounces
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#0F172A",
    paddingRight: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    lineHeight: 17,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
});
