import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRideRequests } from "@/context/RideRequestContext";
import { onrodaTheme } from "../src/theme";
import { rs, rf } from "@/utils/scale";

export type BottomTab = "start" | "fahrten" | "buchen" | "hilfe" | "account";

/** Zentraler Buchen-CTA (Referenz-Layout: grüner Kreis, weißes Plus). */
const BUCHEN_GREEN = "#16A34A";
/** Schwimmende graue Tab-Pille (Bild 2). */
const NAV_PILL_BG = onrodaTheme.colors.surface;
const NAV_INACTIVE = onrodaTheme.colors.textSecondary;

/** Abstand unter der Pille bis zur unteren Kante des nutzbaren Tab-Bereichs (ohne Safe-Area). */
const NAV_FLOAT_ABOVE_SAFE = 0;

/**
 * Zusätzlicher Versatz der Tab-Pille nach unten nur auf dem Home-Screen (Start).
 * Muss mit `TAB_HEIGHT` in `app/index.tsx` übereinstimmen, sonst überlappt die Karte.
 */
export const BOTTOM_TAB_BAR_HOME_OFFSET_Y = rs(8);

/** Gleicher Außenabstand wie `pillOuter` — für Home-Sheet-Zielzeile u. ä. (bündig zur Tab-Pille). */
export const BOTTOM_TAB_BAR_OUTER_PADDING_X = rs(14);
const NAV_PILL_PAD_V = rs(8);
/** Icon-Zeile: höchstes Element = grüner Buchen-Kreis. */
const NAV_ICON_ROW = rs(34);
const NAV_LABEL_GAP = rs(1);
const NAV_LABEL = rf(10);
const NAV_PILL_PAD_BOTTOM = rs(8);

/**
 * Innenhöhe der Tab-Leiste (ohne Safe-Area unten): Float + graue Pille inkl. Icons/Label.
 * Wird vom Home-Sheet (`bottom`) und Scroll-Paddings benötigt.
 */
export const BOTTOM_TAB_BAR_INNER_HEIGHT =
  NAV_FLOAT_ABOVE_SAFE + NAV_PILL_PAD_V + NAV_ICON_ROW + NAV_LABEL_GAP + NAV_LABEL + NAV_PILL_PAD_BOTTOM;

/** Scroll-Content-Padding: Tab-Leiste + Home-Indicator + optionaler Zusatz (z. B. letzte Zeile sichtbar). */
export function mainTabScrollPaddingBottom(safeBottom: number, extra = 0): number {
  return BOTTOM_TAB_BAR_INNER_HEIGHT + safeBottom + extra;
}

/** Einheitlich für Start-/Fahrten-/Buchen-/Hilfe-/Konto-Hauptscreens (Vorbild Wallet-/Help-Chrome + korrekte Tab-Höhe). */
export function tabMainScreenScrollPaddingBottom(safeBottom: number): number {
  return mainTabScrollPaddingBottom(safeBottom, rs(24));
}

export function BottomTabBar({ active, offsetY = 0 }: { active: BottomTab; offsetY?: number }) {
  const insets = useSafeAreaInsets();
  const { myActiveRequests } = useRideRequests();
  const ridesBadge = myActiveRequests?.length ?? 0;

  const NAV_TAB_ICON = rs(17);

  const tabs: { id: BottomTab; icon: React.ComponentProps<typeof Feather>["name"]; label: string; badge?: number; onPress: () => void }[] = [
    { id: "start",      icon: "home",        label: "Start",     onPress: () => router.replace("/") },
    { id: "fahrten",    icon: "calendar",    label: "Fahrten",   badge: ridesBadge, onPress: () => router.replace("/my-rides") },
    { id: "buchen",     icon: "plus",        label: "Buchen",    onPress: () => router.replace("/booking-center") },
    { id: "hilfe",      icon: "help-circle", label: "Hilfe",     onPress: () => router.replace("/help") },
    { id: "account",    icon: "user",        label: "Konto",     onPress: () => router.replace("/profile") },
  ];

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom, backgroundColor: onrodaTheme.colors.background }]}>
      <View style={[styles.pillOuter, offsetY !== 0 ? { transform: [{ translateY: offsetY }] } : null]}>
        <View style={styles.pill}>
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const isPlusTab = tab.id === "buchen";
            const iconBg = isPlusTab
              ? BUCHEN_GREEN
              : (isActive ? "#DC2626" : "transparent");
            const iconColor = isPlusTab
              ? "#ffffff"
              : (isActive ? "#fff" : NAV_INACTIVE);
            const labelColor = isPlusTab
              ? BUCHEN_GREEN
              : (isActive ? onrodaTheme.colors.primary : NAV_INACTIVE);
            return (
              <Pressable
                key={tab.id}
                style={styles.item}
                android_ripple={null}
                onPress={tab.onPress}
              >
                <View
                  style={[
                    styles.iconWrap,
                    isPlusTab && styles.plusTabIconWrap,
                    { backgroundColor: iconBg, borderColor: "transparent" },
                  ]}
                >
                  <Feather name={tab.icon} size={NAV_TAB_ICON} color={iconColor} />
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
  pillOuter: {
    paddingHorizontal: BOTTOM_TAB_BAR_OUTER_PADDING_X,
    paddingTop: 0,
    paddingBottom: NAV_FLOAT_ABOVE_SAFE,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAV_PILL_BG,
    borderRadius: rs(34),
    borderWidth: 1,
    borderColor: onrodaTheme.colors.border,
    paddingVertical: NAV_PILL_PAD_V,
    paddingHorizontal: rs(4),
    shadowColor: onrodaTheme.colors.text,
    shadowOffset: { width: 0, height: rs(10) },
    shadowOpacity: 0.08,
    shadowRadius: rs(24),
    elevation: 8,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: NAV_LABEL_GAP, paddingBottom: 0 },
  iconWrap: {
    width: rs(30), height: rs(30), borderRadius: rs(12),
    justifyContent: "center", alignItems: "center",
    position: "relative",
  },
  label: { fontSize: rf(10), lineHeight: rf(12), fontFamily: "Inter_500Medium", textAlign: "center" },
  plusTabLabel: { fontFamily: "Inter_600SemiBold", fontSize: rf(10), lineHeight: rf(12), marginTop: 0, textAlign: "center" },
  plusTabIconWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(17),
  },
  badge: {
    position: "absolute",
    top: rs(-6),
    right: rs(-9),
    minWidth: rs(19),
    height: rs(19),
    borderRadius: rs(10),
    backgroundColor: onrodaTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(4),
  },
  badgeText: { fontSize: rf(10), fontFamily: "Inter_700Bold", color: "#fff", lineHeight: rf(14) },
});
