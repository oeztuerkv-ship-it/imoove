import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DriverRideEarnings } from "@/utils/fleetDriverRideEarnings";
import {
  formatDriverDistanceKm,
  formatDriverDurationMinutes,
  formatDriverRideCompletedAt,
  formatDriverVehicleLabel,
  formatEuroDe,
} from "@/utils/fleetDriverRideEarnings";

type Props = {
  visible: boolean;
  earnings: DriverRideEarnings | null;
  onClose: () => void;
};

function Divider() {
  return <View style={styles.divider} />;
}

function EarningsRow({
  label,
  value,
  sublabel,
  bold,
  valueTone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  bold?: boolean;
  valueTone?: "default" | "minus" | "tip";
}) {
  return (
    <View style={styles.earningsRow}>
      <View style={styles.earningsLabelCol}>
        <Text style={[styles.earningsLabel, bold && styles.earningsLabelBold]}>{label}</Text>
        {sublabel ? <Text style={styles.earningsSublabel}>{sublabel}</Text> : null}
      </View>
      <Text
        style={[
          styles.earningsValue,
          bold && styles.earningsValueBold,
          valueTone === "minus" && styles.earningsValueMinus,
          valueTone === "tip" && styles.earningsValueTip,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function DriverRideEarningsModal({ visible, earnings, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!earnings) return null;

  const pct = Math.round((earnings.commissionRate ?? 0) * 1000) / 10;
  const pctLabel = Number.isFinite(pct) && pct > 0 ? `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1).replace(".", ",")} %` : "8 %";
  const { date, time } = formatDriverRideCompletedAt(earnings.completedAt);
  const vehicleLabel = formatDriverVehicleLabel(earnings.vehicle);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color="#0f172a" />
          </Pressable>
          <Text style={styles.headerTitle}>Fahrtdetails</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.metaLine}>
            {vehicleLabel} · {date} · {time}
          </Text>
          <Text style={styles.heroAmount}>{formatEuroDe(earnings.net)}</Text>

          {(earnings.actualDurationMinutes != null || earnings.actualDistanceKm != null) && (
            <View style={styles.metricsRow}>
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>Dauer</Text>
                <Text style={styles.metricValue}>
                  {earnings.actualDurationMinutes != null
                    ? formatDriverDurationMinutes(earnings.actualDurationMinutes)
                    : "—"}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCol}>
                <Text style={styles.metricLabel}>Entfernung</Text>
                <Text style={styles.metricValue}>
                  {earnings.actualDistanceKm != null
                    ? formatDriverDistanceKm(earnings.actualDistanceKm)
                    : "—"}
                </Text>
              </View>
            </View>
          )}

          {(earnings.fromFull || earnings.toFull) && (
            <View style={styles.routeCard}>
              {earnings.fromFull ? (
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, styles.routeDotStart]} />
                  <Text style={styles.routeText}>{earnings.fromFull}</Text>
                </View>
              ) : null}
              {earnings.fromFull && earnings.toFull ? <View style={styles.routeLine} /> : null}
              {earnings.toFull ? (
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, styles.routeDotEnd]} />
                  <Text style={styles.routeText}>{earnings.toFull}</Text>
                </View>
              ) : null}
            </View>
          )}

          <Text style={styles.sectionTitle}>Deine Umsätze</Text>
          <View style={styles.earningsCard}>
            <EarningsRow label="Fahrpreis" value={formatEuroDe(earnings.gross)} />
            <Divider />
            <EarningsRow
              label="ONRODA-Provision"
              value={`− ${formatEuroDe(earnings.commission)}`}
              sublabel={`Fahrpreis × ${pctLabel}`}
              valueTone="minus"
            />
            <Divider />
            <EarningsRow label="Dein Anteil" value={formatEuroDe(earnings.payoutAmount)} bold />
            <Divider />
            <EarningsRow
              label="Trinkgeld (100 % an dich)"
              value={formatEuroDe(earnings.tip)}
              valueTone={earnings.tip > 0.005 ? "tip" : "default"}
            />
            <Divider />
            <EarningsRow label="Gesamt" value={formatEuroDe(earnings.net)} bold />
          </View>
        </ScrollView>

        <Pressable style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Weiter</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  metaLine: { fontSize: 14, color: "#64748b", textAlign: "center" },
  heroAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    paddingVertical: 16,
    marginBottom: 20,
  },
  metricCol: { flex: 1, alignItems: "center", gap: 4 },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "#e2e8f0" },
  metricLabel: { fontSize: 13, color: "#64748b" },
  metricValue: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  routeCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeDotStart: { backgroundColor: "#22c55e" },
  routeDotEnd: { backgroundColor: "#ef4444", borderRadius: 2 },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: "#cbd5e1",
    marginLeft: 4,
    marginVertical: 4,
  },
  routeText: { flex: 1, fontSize: 14, color: "#334155", lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 12 },
  earningsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  earningsLabelCol: { flex: 1 },
  earningsLabel: { fontSize: 15, color: "#334155" },
  earningsLabelBold: { fontWeight: "700", color: "#0f172a" },
  earningsSublabel: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  earningsValue: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  earningsValueBold: { fontSize: 16, fontWeight: "800" },
  earningsValueMinus: { color: "#b45309" },
  earningsValueTip: { color: "#047857" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e2e8f0" },
  btn: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
