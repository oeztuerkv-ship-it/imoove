import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from "react-native";

declare global {
  // eslint-disable-next-line no-var
  var __onrodaIntroSplashShown: boolean | undefined;
}

/** Einmal pro App-Session (überlebt Metro-Reload via globalThis). */
export function wasIntroSplashShownThisSession(): boolean {
  return globalThis.__onrodaIntroSplashShown === true;
}

export function markIntroSplashShownThisSession(): void {
  globalThis.__onrodaIntroSplashShown = true;
}

type Props = {
  onFinish: () => void;
};

/**
 * Netflix-Style Intro: Fade-in → Pulse → Fade-out (~2 s), dann App-Start.
 */
export function IntroSplash({ onFinish }: Props) {
  const { width } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const finishedRef = useRef(false);

  const logoWidth = Math.min(width * 0.78, 320) * 2;
  const logoHeight = logoWidth * (682 / 1024);

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(500),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    anim.start(({ finished }) => {
      if (!finished || finishedRef.current) return;
      finishedRef.current = true;
      markIntroSplashShownThisSession();
      onFinish();
    });

    return () => {
      anim.stop();
    };
  }, [onFinish, opacity, scale]);

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={require("../assets/images/onroda-logo-official.png")}
          style={{ width: logoWidth, height: logoHeight }}
          resizeMode="contain"
          accessibilityLabel="ONRODA"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000,
    elevation: 10000,
  },
});
