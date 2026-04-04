import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { type GeoLocation } from "@/utils/routing";

interface MapPlaceholderProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  style?: object;
}

export function MapPlaceholder({ origin, destination, style }: MapPlaceholderProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(interval);
  }, []);

  const hasRoute = origin && destination;

  return (
    <View style={[styles.container, style]}>
      {/* OSM-style beige background is set in container */}

      {/* Land blocks */}
      <View style={[styles.block, { top: "5%", left: "5%", width: "28%", height: "18%" }]} />
      <View style={[styles.block, { top: "5%", left: "38%", width: "20%", height: "12%" }]} />
      <View style={[styles.block, { top: "5%", right: "5%", width: "22%", height: "20%" }]} />
      <View style={[styles.block, { top: "30%", left: "5%", width: "18%", height: "22%" }]} />
      <View style={[styles.block, { top: "30%", left: "30%", width: "25%", height: "18%" }]} />
      <View style={[styles.block, { top: "30%", right: "5%", width: "20%", height: "25%" }]} />
      <View style={[styles.block, { top: "60%", left: "5%", width: "32%", height: "22%" }]} />
      <View style={[styles.block, { top: "60%", left: "42%", width: "22%", height: "18%" }]} />
      <View style={[styles.block, { top: "62%", right: "5%", width: "18%", height: "24%" }]} />

      {/* Green park area */}
      <View style={[styles.park, { top: "20%", left: "25%", width: "10%", height: "8%" }]} />
      <View style={[styles.park, { bottom: "10%", right: "25%", width: "14%", height: "10%" }]} />

      {/* Major roads (wider, light color) */}
      <View style={[styles.roadMajor, styles.roadH, { top: "27%" }]} />
      <View style={[styles.roadMajor, styles.roadH, { top: "58%" }]} />
      <View style={[styles.roadMajor, styles.roadV, { left: "22%" }]} />
      <View style={[styles.roadMajor, styles.roadV, { left: "68%" }]} />

      {/* Minor roads */}
      <View style={[styles.roadMinor, styles.roadH, { top: "14%" }]} />
      <View style={[styles.roadMinor, styles.roadH, { top: "43%" }]} />
      <View style={[styles.roadMinor, styles.roadH, { top: "75%" }]} />
      <View style={[styles.roadMinor, styles.roadV, { left: "40%" }]} />
      <View style={[styles.roadMinor, styles.roadV, { left: "80%" }]} />

      {/* Route line when destination set */}
      {hasRoute && (
        <View style={styles.routeWrapper}>
          <View style={styles.routeLine} />
        </View>
      )}

      {/* Origin pin */}
      <View style={[styles.pinWrapper, { left: "30%", top: "20%" }]}>
        <Animated.View
          style={[styles.pulse, { transform: [{ scale: pulseAnim }] }]}
        />
        <View style={styles.originDot} />
        {origin && (
          <View style={styles.pinLabel}>
            <Text style={styles.pinLabelText} numberOfLines={1}>
              {origin.displayName.split(",")[0]}
            </Text>
          </View>
        )}
      </View>

      {/* Destination pin */}
      {destination && (
        <View style={[styles.pinWrapper, { right: "18%", top: "25%" }]}>
          <View style={styles.destDot}>
            <Feather name="map-pin" size={12} color="#fff" />
          </View>
          <View style={styles.pinLabel}>
            <Text style={styles.pinLabelText} numberOfLines={1}>
              {destination.displayName.split(",")[0]}
            </Text>
          </View>
        </View>
      )}

      {/* Loading label (only when no destination) */}
      {!hasRoute && (
        <View style={styles.centerLabel}>
          <View style={styles.centerBadge}>
            <Feather name="map" size={22} color="#666" />
            <Text style={styles.centerText}>
              Karte wird geladen{".".repeat(dots)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const ROAD_COLOR = "#fff";
const ROAD_BORDER = "#ddd";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2efe9",
    position: "relative",
    overflow: "hidden",
  },
  block: {
    position: "absolute",
    backgroundColor: "#e8e0d8",
    borderRadius: 2,
  },
  park: {
    position: "absolute",
    backgroundColor: "#c8e6c4",
    borderRadius: 4,
  },
  roadMajor: {
    position: "absolute",
    backgroundColor: ROAD_COLOR,
    borderColor: ROAD_BORDER,
  },
  roadMinor: {
    position: "absolute",
    backgroundColor: ROAD_COLOR,
    borderColor: ROAD_BORDER,
    opacity: 0.85,
  },
  roadH: {
    left: 0,
    right: 0,
    height: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  roadV: {
    top: 0,
    bottom: 0,
    width: 7,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  routeWrapper: {
    position: "absolute",
    left: "22%",
    right: "18%",
    top: "30%",
    bottom: "48%",
    justifyContent: "center",
  },
  routeLine: {
    height: 4,
    backgroundColor: "#F5C518",
    borderRadius: 2,
    transform: [{ rotate: "-15deg" }, { scaleX: 1.3 }],
  },
  pinWrapper: {
    position: "absolute",
    alignItems: "center",
  },
  pulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#11111122",
  },
  originDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "#fff",
  },
  destDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinLabel: {
    marginTop: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: 110,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  pinLabelText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#111",
  },
  centerLabel: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  centerBadge: {
    backgroundColor: "#ffffffcc",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  centerText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#555",
  },
});
