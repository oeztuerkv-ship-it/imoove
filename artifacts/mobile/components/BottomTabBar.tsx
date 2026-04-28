import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRideRequests } from "@/context/RideRequestContext";
import { rs, rf } from "@/utils/scale";

export type BottomTab = "start" | "fahrten" | "buchen" | "geldborse" | "account";

export function BottomTabBar({ active }: { active: BottomTab }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myActiveRequests } = useRideRequests();
  const ridesBadge = myActiveRequests?.length ?? 0;

  const tabs: { id: Exclude<BottomTab, "buchen">; icon: React.ComponentProps<typeof Feather>["name"]; label: string; badge?: number; onPress: () => void }[] = [
    { id: "start",      icon: "home",        label: "Start",     onPress: () => router.replace("/") },
    { id: "fahrten",    icon: "calendar",    label: "Fahrten",   badge: ridesBadge, onPress: () => router.replace("/my-rides") },
    { id: "geldborse",  icon: "credit-card", label: "Geldbörse", onPress: () => router.replace("/wallet") },
    { id: "account",    icon: "user",        label: "Account",   onPress: () => router.replace("/profile") },
  ];

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable key={tab.id} style={styles.item} onPress={tab.onPress}>
            <View style={[styles.iconWrap, { backgroundColor: isActive ? "#DC2626" : colors.muted }]}>
              <Feather name={tab.icon} size={rs(13)} color={isActive ? "#fff" : "#111111"} />
              {tab.badge != null && tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: isActive ? "#DC2626" : "#111111" }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
      </View>
      <Pressable
        style={styles.plusWrap}
        onPress={() => router.replace("/booking-center")}
        accessibilityLabel="Buchungszentrale öffnen"
      >
        <View style={[styles.plusBtn, { backgroundColor: "#16A34A", borderColor: colors.surface }]}>
          <Feather name="plus" size={rs(18)} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
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
  badge: {
    position: "absolute", top: -5, right: -8,
    minWidth: rs(17), height: rs(17), borderRadius: rs(9),
    backgroundColor: "#DC2626",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: rs(3),
  },
  badgeText: { fontSize: rf(10), fontFamily: "Inter_700Bold", color: "#fff", lineHeight: rf(13) },
  plusWrap: {
    position: "absolute",
    left: "50%",
    top: -rs(18),
    marginLeft: -rs(26),
  },
  plusBtn: {
    width: rs(52),
    height: rs(52),
    borderRadius: rs(26),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
});
