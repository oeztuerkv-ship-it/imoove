import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  /** Optional „Start → Ziel“ unter dem Hinweis. */
  routeLine?: string | null;
  onOk: () => void;
};

/** In-App T−1h: Start/Ziel schwarz, „1 Stunde“ schwarz in einer Zeile. */
export function DriverPrivateReminderDueModal({ visible, routeLine, onOk }: Props) {
  const route = (routeLine ?? "").trim();
  const routeParts = route.includes("→")
    ? route.split("→").map((p) => p.trim()).filter(Boolean)
    : route
      ? [route]
      : [];
  const from = routeParts[0] ?? "";
  const to = routeParts.length > 1 ? routeParts[routeParts.length - 1] : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onOk}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Feather name="clock" size={22} color="#111827" />
            <Text style={styles.title}>Privatauftrag</Text>
          </View>

          <Text style={styles.bodyLine}>
            Dein Privatauftrag beginnt in <Text style={styles.bodyEmphasis}>1 Stunde</Text>
          </Text>

          {from || to ? (
            <View style={styles.routeBlock}>
              <View style={styles.routeRail}>
                <View style={styles.dotGreen} />
                {to ? <View style={styles.routeLine} /> : null}
                {to ? <View style={styles.dotRed} /> : null}
              </View>
              <View style={styles.routePlaces}>
                {from ? (
                  <Text style={styles.routePlace} numberOfLines={2}>
                    {from}
                  </Text>
                ) : null}
                {to ? (
                  <Text style={styles.routePlace} numberOfLines={2}>
                    {to}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.okBtn, pressed && { opacity: 0.88 }]}
            onPress={onOk}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text style={styles.okText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  bodyLine: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4B5563",
    marginBottom: 14,
  },
  bodyEmphasis: {
    color: "#111827",
    fontWeight: "800",
  },
  routeBlock: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    marginBottom: 18,
  },
  routeRail: {
    width: 14,
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 4,
  },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#16A34A",
  },
  dotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  routeLine: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: "#D1D5DB",
    marginVertical: 4,
  },
  routePlaces: {
    flex: 1,
    gap: 12,
    justifyContent: "space-between",
  },
  routePlace: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#111827",
  },
  okBtn: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  okText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
