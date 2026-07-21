import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

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

/** Offizielles Gesamtlogo (Pin + ONRODA). */
const LOGO = require("../assets/images/onroda-logo-official.png");
const TAXI = require("../assets/images/onroda-splash-taxi-classic.png");

/** Logo-Asset 1024×682. */
const LOGO_ASPECT = 682 / 1024;

const TOTAL_MS = 2400;

/**
 * Intro: offizielles ONRODA-Logo, Taxi fährt geradeaus unter dem Schriftzug.
 */
export function IntroSplash({ onFinish }: Props) {
  const { width } = useWindowDimensions();
  const finishedRef = useRef(false);

  const logoWidth = Math.min(width * 0.72, 300);
  const logoHeight = logoWidth * LOGO_ASPECT;
  const taxiW = Math.max(78, logoWidth * 0.36);
  const taxiH = taxiW * 0.5;
  /** Unter dem Wordmark „ONRODA“ (unterer Logo-Bereich). */
  const taxiTop = logoHeight * 0.92;
  const driveFrom = -taxiW - 12;
  const driveTo = logoWidth + 12;

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(1)).current;
  const taxiOpacity = useRef(new Animated.Value(0)).current;
  const taxiX = useRef(new Animated.Value(driveFrom)).current;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markIntroSplashShownThisSession();
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const ease = Easing.inOut(Easing.cubic);

    const anim = Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(taxiOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(taxiX, {
          toValue: driveTo,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.04,
          duration: 120,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 120,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taxiOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(80),
    ]);

    anim.start(({ finished: ok }) => {
      if (ok) finish();
    });

    const safety = setTimeout(finish, TOTAL_MS + 500);
    return () => {
      anim.stop();
      clearTimeout(safety);
    };
  }, [driveTo, finish, logoOpacity, logoScale, taxiOpacity, taxiX]);

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityLabel="ONRODA">
      <View style={{ width: logoWidth, height: logoHeight + taxiH + 8 }}>
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <Image
            source={LOGO}
            style={{ width: logoWidth, height: logoHeight }}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: taxiTop,
            width: taxiW,
            height: taxiH,
            opacity: taxiOpacity,
            transform: [{ translateX: taxiX }],
          }}
        >
          <Image source={TAXI} style={{ width: taxiW, height: taxiH }} resizeMode="contain" />
        </Animated.View>
      </View>
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
