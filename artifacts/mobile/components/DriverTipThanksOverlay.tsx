import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  onFinished: () => void;
};

const DISPLAY_MS = 2800;

/** Kurzer Dank-Moment nach Fahrtende, wenn Trinkgeld bereits auf der Fahrt steht. */
export function DriverTipThanksOverlay({ visible, onFinished }: Props) {
  useEffect(() => {
    if (!visible) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(onFinished, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [visible, onFinished]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinished}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Feather name="heart" size={36} color="#ef4444" />
          </View>
          <Text style={styles.title}>Danke für dein Trinkgeld!</Text>
          <Text style={styles.sub}>100 % geht an dich — schön, dass du geschätzt wirst.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748b",
    textAlign: "center",
  },
});
