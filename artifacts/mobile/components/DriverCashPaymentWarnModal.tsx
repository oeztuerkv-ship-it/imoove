import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const APPLE_BLUE = "#007AFF";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** System-Alert-Optik — Abbrechen | OK nebeneinander, OK mit blauem Hintergrund. */
export function DriverCashPaymentWarnModal({ visible, onCancel, onConfirm }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.title}>Achtung Barzahlung!</Text>
            <Text style={styles.message}>
              Bitte Barzahlung am Ziel vom Kunden annehmen — nicht vergessen.
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.okBtn, pressed && styles.okBtnPressed]}
              onPress={onConfirm}
            >
              <Text style={styles.okText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 292,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 10 },
    }),
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: Platform.OS === "ios" ? "600" : "700",
    color: "#000000",
    textAlign: "center",
  },
  message: {
    marginTop: 6,
    fontSize: 14,
    color: "#000000",
    textAlign: "center",
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(60,60,67,0.29)",
    minHeight: 46,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(60,60,67,0.29)",
  },
  okBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: APPLE_BLUE,
  },
  btnPressed: { opacity: 0.72 },
  okBtnPressed: { backgroundColor: "#0062CC" },
  cancelText: {
    fontSize: 17,
    color: "#000000",
    fontWeight: Platform.OS === "ios" ? "400" : undefined,
  },
  okText: {
    fontSize: 17,
    fontWeight: Platform.OS === "ios" ? "600" : "700",
    color: "#FFFFFF",
  },
});
