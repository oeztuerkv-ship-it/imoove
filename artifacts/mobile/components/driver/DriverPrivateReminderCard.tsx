import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FleetPrivateReminder } from "@/utils/fleetPrivateRemindersApi";

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
  return {
    date: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
  };
}

type Props = {
  reminder: FleetPrivateReminder;
  onPress: () => void;
  onNavigate: () => void;
  onComplete: () => void;
};

/** Private Notiz in Angenommen — Start/Ziel-Linie, Datum/Zeit, Navi + Erledigt. */
export function DriverPrivateReminderCard({ reminder, onPress, onNavigate, onComplete }: Props) {
  const { date, time } = fmtDateTime(reminder.scheduledAt);
  const from = (reminder.fromFull || "—").trim() || "—";
  const to = (reminder.toFull || "—").trim() || "—";
  const note = reminder.note?.trim() ?? "";
  const canNav = Boolean(reminder.fromFull?.trim() || reminder.toFull?.trim());

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      accessibilityLabel="Privatauftrag bearbeiten"
    >
      <View style={styles.topRow}>
        <View style={styles.privatPill}>
          <Feather name="lock" size={11} color="#166534" />
          <Text style={styles.privatPillText}>Privatauftrag</Text>
        </View>
        <Feather name="edit-2" size={14} color="#9CA3AF" />
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeRail}>
          <View style={styles.dotStart} />
          <View style={styles.routeLine} />
          <View style={styles.dotEnd} />
        </View>
        <View style={styles.routeTextCol}>
          <Text style={styles.routePlace} numberOfLines={1}>
            {from}
          </Text>
          <Text style={styles.routePlace} numberOfLines={1}>
            {to}
          </Text>
        </View>
      </View>

      {note ? (
        <Text style={styles.note} numberOfLines={2}>
          {note}
        </Text>
      ) : null}

      <View style={styles.dtBox}>
        <Feather name="clock" size={14} color="#6B7280" />
        <Text style={styles.dtText}>
          {date} · {time}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, !canNav && styles.actionBtnDisabled]}
          onPress={(e) => {
            e.stopPropagation?.();
            onNavigate();
          }}
          disabled={!canNav}
        >
          <Feather name="navigation" size={14} color={canNav ? "#166534" : "#9CA3AF"} />
          <Text style={[styles.actionBtnText, !canNav && { color: "#9CA3AF" }]}>Navi</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtnDone}
          onPress={(e) => {
            e.stopPropagation?.();
            onComplete();
          }}
        >
          <Feather name="check" size={14} color="#fff" />
          <Text style={styles.actionBtnDoneText}>Erledigt</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#111827",
    borderLeftWidth: 4,
    borderLeftColor: "#22C55E",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  privatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  privatPillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#166534",
  },
  routeBlock: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  routeRail: {
    width: 14,
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 4,
  },
  dotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  routeLine: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: "#D1D5DB",
    marginVertical: 3,
  },
  dotEnd: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  routeTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
    gap: 14,
  },
  routePlace: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    lineHeight: 20,
  },
  note: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 16,
  },
  dtBox: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1.5,
    borderColor: "#22C55E",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dtText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  actions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
  },
  actionBtnDisabled: {
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    opacity: 0.55,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#166534",
  },
  actionBtnDone: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#22C55E",
  },
  actionBtnDoneText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
