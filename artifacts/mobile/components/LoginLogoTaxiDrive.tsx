import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAXI_CLASSIC = require("../assets/images/onroda-splash-taxi-classic.png");
const TAXI_VAN = require("../assets/images/onroda-splash-taxi-van.png");

type Props = {
  taxiWidth?: number;
  /** Abstand vom Bildschirmrand. */
  edgeInset?: number;
  /** Dauer pro Rechteck-Seite (langsamer = höher). */
  edgeDurationMs?: number;
};

/**
 * Classic + Van fahren langsam im Rechteck am Bildschirmrand (Login/Onboarding).
 * Als erstes Kind eines full-screen Parents legen; `pointerEvents="none"` — Tipps bleiben nutzbar.
 */
export function LoginLogoTaxiDrive({
  taxiWidth = 58,
  edgeInset = 14,
  edgeDurationMs = 4500,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const taxiH = taxiWidth * 0.48;

  const left = edgeInset + insets.left;
  const top = edgeInset + Math.max(insets.top, 8);
  const right = Math.max(left + 40, width - edgeInset - insets.right - taxiWidth);
  const bottom = Math.max(top + 40, height - edgeInset - Math.max(insets.bottom, 8) - taxiH);

  const cX = useRef(new Animated.Value(0)).current;
  const cY = useRef(new Animated.Value(0)).current;
  const cRot = useRef(new Animated.Value(0)).current;
  const vX = useRef(new Animated.Value(0)).current;
  const vY = useRef(new Animated.Value(0)).current;
  const vRot = useRef(new Animated.Value(180)).current;

  useEffect(() => {
    cX.setValue(left);
    cY.setValue(top);
    cRot.setValue(0);
    vX.setValue(right);
    vY.setValue(bottom);
    vRot.setValue(180);

    const ease = Easing.linear;
    const snapRot = (rot: Animated.Value, deg: number) =>
      Animated.timing(rot, { toValue: deg, duration: 0, useNativeDriver: true });

    const classicLoop = Animated.loop(
      Animated.sequence([
        snapRot(cRot, 0),
        Animated.timing(cX, { toValue: right, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(cRot, 90),
        Animated.timing(cY, { toValue: bottom, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(cRot, 180),
        Animated.timing(cX, { toValue: left, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(cRot, 270),
        Animated.timing(cY, { toValue: top, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
      ]),
    );

    const vanLoop = Animated.loop(
      Animated.sequence([
        snapRot(vRot, 180),
        Animated.timing(vX, { toValue: left, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(vRot, 270),
        Animated.timing(vY, { toValue: top, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(vRot, 0),
        Animated.timing(vX, { toValue: right, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
        snapRot(vRot, 90),
        Animated.timing(vY, { toValue: bottom, duration: edgeDurationMs, easing: ease, useNativeDriver: true }),
      ]),
    );

    classicLoop.start();
    vanLoop.start();
    return () => {
      classicLoop.stop();
      vanLoop.stop();
    };
  }, [bottom, cRot, cX, cY, edgeDurationMs, left, right, top, vRot, vX, vY]);

  const rotClassic = cRot.interpolate({
    inputRange: [0, 90, 180, 270],
    outputRange: ["0deg", "90deg", "180deg", "270deg"],
  });
  const rotVan = vRot.interpolate({
    inputRange: [0, 90, 180, 270],
    outputRange: ["0deg", "90deg", "180deg", "270deg"],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: taxiWidth,
          height: taxiH,
          transform: [{ translateX: cX }, { translateY: cY }, { rotate: rotClassic }],
        }}
      >
        <Image source={TAXI_CLASSIC} style={{ width: taxiWidth, height: taxiH }} resizeMode="contain" />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: taxiWidth,
          height: taxiH,
          transform: [{ translateX: vX }, { translateY: vY }, { rotate: rotVan }],
        }}
      >
        <Image source={TAXI_VAN} style={{ width: taxiWidth, height: taxiH }} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    elevation: 1,
  },
});
