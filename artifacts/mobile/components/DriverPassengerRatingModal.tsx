import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  customerName?: string;
  submitting?: boolean;
  onSubmit: (stars: number) => void;
  onSkip: () => void;
};

export function DriverPassengerRatingModal({
  visible,
  customerName,
  submitting = false,
  onSubmit,
  onSkip,
}: Props) {
  const name = customerName?.trim() || "Kunde";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Feather name="star" size={28} color="#F59E0B" />
            <Text style={styles.title}>Kunde bewerten</Text>
          </View>
          <Text style={styles.subtitle}>Wie war die Fahrt mit {name}?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable
                key={i}
                style={styles.starBtn}
                disabled={submitting}
                onPress={() => onSubmit(i)}
              >
                <Feather name="star" size={36} color="#F59E0B" />
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.skipBtn} disabled={submitting} onPress={onSkip}>
            <Text style={styles.skipText}>{submitting ? "Wird gespeichert…" : "Überspringen"}</Text>
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
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#64748B" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 8 },
  starBtn: { padding: 4 },
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#64748B" },
});
