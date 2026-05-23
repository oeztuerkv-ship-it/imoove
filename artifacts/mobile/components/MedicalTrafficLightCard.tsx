import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MedicalScanWarning, MedicalTrafficLight } from "@/utils/medicalScanApi";

const TRAFFIC_CONFIG: Record<
  MedicalTrafficLight,
  { title: string; subtitle: string; bg: string; border: string; accent: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  green: {
    title: "Grün — Scan in Ordnung",
    subtitle: "Keine relevanten Warnungen erkannt.",
    bg: "#ECFDF5",
    border: "#86EFAC",
    accent: "#15803D",
    icon: "check-circle",
  },
  yellow: {
    title: "Gelb — Hinweise beachten",
    subtitle: "Unsicherheiten erkannt. Weiterfahrt mit Vorsicht möglich.",
    bg: "#FFFBEB",
    border: "#FCD34D",
    accent: "#B45309",
    icon: "alert-circle-outline",
  },
  red: {
    title: "Rot — Ablehnen empfohlen",
    subtitle: "Schwerwiegende Abweichungen. Fahrt nur nach Prüfung fortsetzen.",
    bg: "#FEF2F2",
    border: "#FCA5A5",
    accent: "#B91C1C",
    icon: "close-circle-outline",
  },
};

type Props = {
  trafficLight: MedicalTrafficLight;
  warnings: MedicalScanWarning[];
  insuranceName?: string;
  transportDate?: string | null;
  onPrimaryAction: () => void;
  primaryBusy?: boolean;
};

export function MedicalTrafficLightCard({
  trafficLight,
  warnings,
  insuranceName,
  transportDate,
  onPrimaryAction,
  primaryBusy = false,
}: Props) {
  const cfg = TRAFFIC_CONFIG[trafficLight];
  const visibleWarnings = warnings.filter((w) => w.severity !== "info");
  const primaryLabel =
    trafficLight === "yellow"
      ? "Trotzdem fortfahren"
      : trafficLight === "red"
        ? "Schließen"
        : "Weiter";

  return (
    <View style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name={cfg.icon} size={28} color={cfg.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: cfg.accent }]}>{cfg.title}</Text>
          <Text style={styles.subtitle}>{cfg.subtitle}</Text>
        </View>
      </View>

      {insuranceName?.trim() || transportDate ? (
        <View style={styles.metaBox}>
          {insuranceName?.trim() ? (
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Kasse: </Text>
              {insuranceName.trim()}
            </Text>
          ) : null}
          {transportDate ? (
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Datum: </Text>
              {transportDate}
            </Text>
          ) : null}
        </View>
      ) : null}

      {visibleWarnings.length > 0 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnHeading}>Warnungen</Text>
          {visibleWarnings.map((w) => (
            <View key={`${w.code}-${w.message}`} style={styles.warnRow}>
              <Feather
                name={w.severity === "block_recommended" ? "alert-octagon" : "alert-triangle"}
                size={14}
                color={w.severity === "block_recommended" ? "#B91C1C" : "#B45309"}
              />
              <Text style={styles.warnText}>{w.message || w.code}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {trafficLight === "red" ? (
        <View style={styles.redHint}>
          <Text style={styles.redHintText}>Ablehnen empfohlen — kein automatischer Stopp der Fahrt.</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onPrimaryAction}
        disabled={primaryBusy}
        style={({ pressed }) => [
          styles.primaryBtn,
          {
            backgroundColor: trafficLight === "yellow" ? "#F59E0B" : trafficLight === "red" ? "#64748B" : "#16A34A",
            opacity: pressed ? 0.9 : primaryBusy ? 0.55 : 1,
          },
        ]}
      >
        <Text style={styles.primaryBtnText}>{primaryBusy ? "Bitte warten…" : primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#475569",
    lineHeight: 18,
  },
  metaBox: {
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  metaLine: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#0F172A",
  },
  metaLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#64748B",
  },
  warnBox: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  warnHeading: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  warnRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#1E293B",
    lineHeight: 18,
  },
  redHint: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  redHintText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#991B1B",
    textAlign: "center",
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
