import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const APPLE_BLUE = "#007AFF";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** System-Alert-Optik — nur OK mit vollem blauen Hintergrund (nicht natives Alert). */
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  card: {
    width: "100%",
    maxWidth: 270,
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
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: Platform.OS === "ios" ? "600" : "700",
    color: "#000000",
    textAlign: "center",
  },
  message: {
    marginTop: 4,
    fontSize: 13,
    color: "#000000",
    textAlign: "center",
    lineHeight: 18,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(60,60,67,0.29)",
  },
  okBtn: {
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: APPLE_BLUE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(60,60,67,0.18)",
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
