import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRideRequests } from "@/context/RideRequestContext";
import { rs, rf } from "@/utils/scale";

export type BottomTab = "start" | "fahrten" | "buchen" | "geldborse" | "account";

/** Zentraler Buchen-CTA (Referenz-Layout: grüner Kreis, weißes Plus). */
const BUCHEN_GREEN = "#16A34A";

/**
 * Innenhöhe der Tab-Leiste (ohne Safe-Area unten), abgestimmt auf `styles.bar` + `item` (Icon inkl. Plus-Rand, Label, Abstände).
 * Wird vom Home-Sheet (`bottom`) und Scroll-Paddings benötigt — fehlender Wert verschiebt Sheet & Tabs nach oben.
 */
export const BOTTOM_TAB_BAR_INNER_HEIGHT = rs(7) + rs(38) + rs(3) + rf(10) + rs(4);

/** Scroll-Content-Padding: Tab-Leiste + Home-Indicator + optionaler Zusatz (z. B. letzte Zeile sichtbar). */
export function mainTabScrollPaddingBottom(safeBottom: number, extra = 0): number {
  return BOTTOM_TAB_BAR_INNER_HEIGHT + safeBottom + extra;
}

export function BottomTabBar({ active }: { active: BottomTab }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myActiveRequests } = useRideRequests();
  const ridesBadge = myActiveRequests?.length ?? 0;

  const tabs: { id: BottomTab; icon: React.ComponentProps<typeof Feather>["name"]; label: string; badge?: number; onPress: () => void }[] = [
    { id: "start",      icon: "home",        label: "Start",     onPress: () => router.replace("/") },
    { id: "fahrten",    icon: "calendar",    label: "Fahrten",   badge: ridesBadge, onPress: () => router.replace("/my-rides") },
    { id: "buchen",     icon: "plus",        label: "Buchen",    onPress: () => router.replace("/booking-center") },
    { id: "geldborse",  icon: "credit-card", label: "Geldbörse", onPress: () => router.replace("/wallet") },
    { id: "account",    icon: "user",        label: "Account",   onPress: () => router.replace("/profile") },
  ];

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const isPlusTab = tab.id === "buchen";
        const iconBg = isPlusTab
          ? BUCHEN_GREEN
          : (isActive ? "#DC2626" : colors.muted);
        const iconColor = isPlusTab
          ? "#ffffff"
          : (isActive ? "#fff" : "#111111");
        const labelColor = isPlusTab
          ? BUCHEN_GREEN
          : (isActive ? "#DC2626" : "#111111");
        return (
          <Pressable key={tab.id} style={styles.item} onPress={tab.onPress}>
            <View
              style={[
                styles.iconWrap,
                isPlusTab && styles.plusTabIconWrap,
                { backgroundColor: iconBg, borderColor: "transparent" },
              ]}
            >
              <Feather name={tab.icon} size={isPlusTab ? rs(18) : rs(13)} color={iconColor} />
              {tab.badge != null && tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isPlusTab && styles.plusTabLabel, { color: labelColor }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: rs(7),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(3), paddingBottom: rs(4) },
  iconWrap: {
    width: rs(28), height: rs(28), borderRadius: rs(8),
    justifyContent: "center", alignItems: "center",
    position: "relative",
  },
  label: { fontSize: rf(10), fontFamily: "Inter_500Medium" },
  plusTabLabel: { fontFamily: "Inter_600SemiBold", fontSize: rf(10), marginTop: 1 },
  plusTabIconWrap: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
  },
  badge: {
    position: "absolute", top: -5, right: -8,
    minWidth: rs(17), height: rs(17), borderRadius: rs(9),
    backgroundColor: "#DC2626",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: rs(3),
  },
  badgeText: { fontSize: rf(10), fontFamily: "Inter_700Bold", color: "#fff", lineHeight: rf(13) },
});
