import React, { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { getDriverPresenceSnapshot } from "@/utils/driverBackgroundLocation";
import { isDriverPushReady } from "@/utils/syncDriverExpoPushToken";
import {
  getBackgroundPermissionsSafe,
  getForegroundPermissionsSafe,
} from "@/utils/safeExpoLocation";

type ChipState = "ok" | "warn" | "bad";

type ChipModel = {
  key: string;
  label: string;
  state: ChipState;
};

function chipGlyph(state: ChipState): string {
  if (state === "ok") return "✅";
  if (state === "warn") return "⚠️";
  return "❌";
}

function chipColor(state: ChipState): string {
  if (state === "ok") return "#166534";
  if (state === "warn") return "#B45309";
  return "#B91C1C";
}

export function DriverPresenceStatusBar(props: {
  isMarketOnline: boolean;
  hasActiveRide: boolean;
  onPressBatteryHint?: () => void;
  onPressIosPushHint?: () => void;
}) {
  const [chips, setChips] = useState<ChipModel[]>([]);
  const [pushReady, setPushReady] = useState<"ok" | "denied" | "missing">("missing");

  const refresh = useCallback(async () => {
    const push = await isDriverPushReady();
    setPushReady(push);
    const fg = await getForegroundPermissionsSafe();
    const bg = await getBackgroundPermissionsSafe();
    const presence = await getDriverPresenceSnapshot();

    const pushState: ChipState =
      push === "ok" ? "ok" : push === "denied" ? "bad" : "bad";

    let locationState: ChipState = "bad";
    if (fg?.status === "granted" && bg?.status === "granted") {
      locationState = "ok";
    } else if (fg?.status === "granted") {
      locationState = "warn";
    }

    const next: ChipModel[] = [
      { key: "push", label: "Push", state: pushState },
      { key: "location", label: "Standort", state: locationState },
    ];

    if (Platform.OS === "android") {
      const needsService = props.isMarketOnline || props.hasActiveRide;
      let serviceState: ChipState = "bad";
      if (!needsService) {
        serviceState = "warn";
      } else if (presence.fgsRunning) {
        serviceState = "ok";
      } else if (props.isMarketOnline && !props.hasActiveRide) {
        serviceState = "bad";
      } else if (props.hasActiveRide) {
        serviceState = "warn";
      }
      next.push({ key: "service", label: "Online-Service", state: serviceState });
    }

    setChips(next);
  }, [props.hasActiveRide, props.isMarketOnline]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (chips.length === 0) return null;

  const showBatteryAction =
    Platform.OS === "android" &&
    props.isMarketOnline &&
    chips.some((c) => c.key === "service" && c.state !== "ok");

  const showIosPushAction =
    Platform.OS === "ios" &&
    props.isMarketOnline &&
    pushReady !== "ok" &&
    props.onPressIosPushHint;

  const showIosOnlineNote =
    Platform.OS === "ios" && props.isMarketOnline && !props.hasActiveRide;

  return (
    <View style={styles.container}>
      <View style={styles.wrap}>
        {chips.map((chip) => (
          <View key={chip.key} style={[styles.chip, { borderColor: chipColor(chip.state) }]}>
            <Text style={styles.chipText}>
              {chip.label} {chipGlyph(chip.state)}
            </Text>
          </View>
        ))}
        {showBatteryAction && props.onPressBatteryHint ? (
          <Pressable onPress={props.onPressBatteryHint} style={styles.hintBtn}>
            <Text style={styles.hintText}>Akku-Hinweis</Text>
          </Pressable>
        ) : null}
        {showIosPushAction ? (
          <Pressable onPress={props.onPressIosPushHint} style={styles.hintBtn}>
            <Text style={styles.hintText}>Push aktivieren</Text>
          </Pressable>
        ) : null}
        {pushReady !== "ok" && Platform.OS === "ios" ? (
          <Pressable onPress={() => void Linking.openSettings()} style={styles.hintBtn}>
            <Text style={styles.hintText}>Einstellungen</Text>
          </Pressable>
        ) : null}
      </View>
      {showIosOnlineNote ? (
        <Text style={styles.iosNote}>
          iOS: Nach Schließen der App Push antippen oder ONRODA öffnen — Aufträge erscheinen im Dashboard.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 4,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  hintBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hintText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#B45309",
    textDecorationLine: "underline",
  },
  iosNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
});
