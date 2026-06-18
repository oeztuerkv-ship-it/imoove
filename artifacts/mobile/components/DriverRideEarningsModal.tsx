import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { DriverRideEarnings } from "@/utils/fleetDriverRideEarnings";
import { formatEuroDe } from "@/utils/fleetDriverRideEarnings";

type Props = {
  visible: boolean;
  earnings: DriverRideEarnings | null;
  onClose: () => void;
};

export function DriverRideEarningsModal({ visible, earnings, onClose }: Props) {
  if (!earnings) return null;
  const pct = Math.round((earnings.commissionRate ?? 0) * 1000) / 10;
  const fareNet = Math.max(0, earnings.gross - earnings.commission);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Feather name="check-circle" size={28} color="#22C55E" />
            <Text style={styles.title}>Fahrt abgeschlossen</Text>
          </View>
          <Text style={styles.subtitle}>Ihre Einnahmen für diese Fahrt:</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Fahrtpreis (Taxameter)</Text>
            <Text style={styles.value}>{formatEuroDe(earnings.gross)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>ONRODA-Provision{pct > 0 ? ` (${pct} %)` : ""}</Text>
            <Text style={[styles.value, styles.minus]}>− {formatEuroDe(earnings.commission)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Anteil Fahrtpreis</Text>
            <Text style={styles.value}>{formatEuroDe(fareNet)}</Text>
          </View>
          {earnings.tip > 0.005 ? (
            <View style={styles.row}>
              <Text style={styles.label}>Trinkgeld (100 %)</Text>
              <Text style={[styles.value, styles.tip]}>+ {formatEuroDe(earnings.tip)}</Text>
            </View>
          ) : null}
          <View style={[styles.row, styles.netRow]}>
            <Text style={styles.netLabel}>Netto für Sie</Text>
            <Text style={styles.netValue}>{formatEuroDe(earnings.net)}</Text>
          </View>
          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Weiter</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#64748b", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  label: { fontSize: 15, color: "#334155", flex: 1, paddingRight: 8 },
  value: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  minus: { color: "#b45309" },
  tip: { color: "#047857" },
  netRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  netLabel: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  netValue: { fontSize: 22, fontWeight: "800", color: "#047857" },
  btn: {
    marginTop: 16,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
