import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import type { RideRequest } from "@/context/RideRequestContext";

function minutesUntil(d: Date) {
  return Math.round((d.getTime() - Date.now()) / 60000);
}

function canActivatePrebook(scheduledAt: Date) {
  const m = minutesUntil(scheduledAt);
  return m >= 25 && m <= 45;
}

function fmtPickupTime(d: Date) {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

type Props = {
  ride: RideRequest;
  extraCount?: number;
  onPress: () => void;
};

/** Schmale Leiste direkt über der Tab-Navigation — angenommene Vorbestellung im Blick. */
export function DriverAssignedPrebookTabHint({ ride, extraCount = 0, onPress }: Props) {
  const [, setTick] = useState(0);
  const arrowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [arrowAnim]);

  const arrowTranslateX = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 7],
  });
  const arrowOpacity = arrowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1, 0.35],
  });

  const scheduledAt = useMemo(
    () => (ride.scheduledAt ? new Date(ride.scheduledAt) : null),
    [ride.scheduledAt],
  );
  if (!scheduledAt || !Number.isFinite(scheduledAt.getTime())) return null;

  const activatable = canActivatePrebook(scheduledAt);
  const pickupTime = fmtPickupTime(scheduledAt);
  const moreLabel = extraCount > 0 ? ` (+${extraCount} weitere)` : "";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Angenommene Vorbestellung öffnen"
      style={{
        borderTopWidth: 1,
        borderTopColor: activatable ? "#FECACA" : "#FDE68A",
        backgroundColor: activatable ? "#FEF2F2" : "#FFFBEB",
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Animated.View style={{ transform: [{ translateX: arrowTranslateX }], opacity: arrowOpacity }}>
        <Feather name="arrow-right" size={22} color="#111827" />
      </Animated.View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 16,
            fontFamily: "Inter_700Bold",
            color: activatable ? "#E11D2E" : "#92400E",
          }}
          numberOfLines={1}
        >
          {activatable ? "Vorbestellung — jetzt aktivieren" : "Angenommene Vorbestellung"}
          {moreLabel}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_500Medium",
            color: activatable ? "#B91C1C" : "#B45309",
            marginTop: 2,
          }}
          numberOfLines={2}
        >
          {activatable
            ? `Abholung ${pickupTime} Uhr · bitte bis 25 Min. vorher aktivieren`
            : `Abholung ${pickupTime} Uhr · Aktivierung ab 45 Min. vorher`}
        </Text>
      </View>
    </Pressable>
  );
}
