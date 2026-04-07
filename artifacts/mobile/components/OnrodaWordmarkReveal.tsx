import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const RED = "#DC2626";
const WORD = "onroda" as const;

/** Mitte → außen: r,o (Idx 2,3) → n,d (1,4) → o,a (0,5) */
const REVEAL_WAVES: number[][] = [
  [2, 3],
  [1, 4],
  [0, 5],
];

/** Volle Umdrehungen während Ladephase (~1,2 s) */
const SPIN_TURNS = 2.25;

type Props = {
  /** Wird derzeit nicht für die Schrift genutzt (alle Buchstaben Akzentrot); Prop bleibt für Aufrufer erhalten. */
  textColor: string;
  fontSize: number;
  letterSpacing?: number;
  minHeight?: number;
};

const PHASE1_MS = 1200;
const STAGGER_MS = 60;
const LETTER_IN_MS = 260;
const RING_OUT_MS = 280;
/** Etwas größer als übergebenes font_size */
const SIZE_MUL = 1.07;

/**
 * Phase 1: Rotierendes „O“ (Ring) + leichter Pulse / Glow („lädt“).
 * Phase 2: Ring weg, Schriftzug onroda — Buchstaben von innen nach außen (Fade + Slide).
 * Endzustand: ruhig, ganzer Schriftzug in Akzentrot, leicht größer als fontSize.
 */
export function OnrodaWordmarkReveal({
  textColor: _textColor,
  fontSize,
  letterSpacing = -0.8,
  minHeight = 48,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(1)).current;
  const ringExitScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.22)).current;

  const letterOpacity = useRef(WORD.split("").map(() => new Animated.Value(0))).current;
  const letterY = useRef(WORD.split("").map(() => new Animated.Value(10))).current;

  useEffect(() => {
    let cancelled = false;

    const spinMain = Animated.timing(spin, {
      toValue: SPIN_TURNS,
      duration: PHASE1_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 1.12,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.42,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.18,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulseLoop.start();
    spinMain.start();

    const timer = setTimeout(() => {
      if (cancelled) return;
      pulseLoop.stop();
      spinMain.stop();
      pulse.setValue(1);
      glowOpacity.setValue(0);

      const letterAnims: ReturnType<typeof Animated.sequence>[] = [];
      REVEAL_WAVES.forEach((wave, waveIdx) => {
        wave.forEach((idx) => {
          letterAnims.push(
            Animated.sequence([
              Animated.delay(waveIdx * STAGGER_MS),
              Animated.parallel([
                Animated.timing(letterOpacity[idx], {
                  toValue: 1,
                  duration: LETTER_IN_MS,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
                Animated.timing(letterY[idx], {
                  toValue: 0,
                  duration: LETTER_IN_MS,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
              ]),
            ]),
          );
        });
      });

      Animated.parallel([
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: RING_OUT_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringExitScale, {
          toValue: 0.4,
          duration: RING_OUT_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        ...letterAnims,
      ]).start();
    }, PHASE1_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      pulseLoop.stop();
      spinMain.stop();
    };
  }, [spin, pulse, glowOpacity, ringOpacity, ringExitScale, letterOpacity, letterY]);

  const rotate = spin.interpolate({
    inputRange: [0, SPIN_TURNS],
    outputRange: ["0deg", `${360 * SPIN_TURNS}deg`],
  });

  const ringScale = Animated.multiply(ringExitScale, pulse);

  const displaySize = fontSize * SIZE_MUL;
  const charGap =
    WORD.length > 1
      ? (letterSpacing / Math.max(1, WORD.length - 1)) * SIZE_MUL
      : 0;

  return (
    <View
      style={[styles.wrap, { minHeight: minHeight * SIZE_MUL }]}
      accessibilityLabel="onroda"
      accessible
    >
      <Animated.View
        style={[styles.ringHolder, { opacity: ringOpacity }]}
        pointerEvents="none"
      >
        <Animated.View
          style={[
            styles.glowRing,
            {
              opacity: glowOpacity,
              transform: [{ scale: pulse }],
            },
          ]}
        />
        <Animated.View
          style={{
            transform: [{ rotate }, { scale: ringScale }],
          }}
        >
          <View style={styles.ring} />
        </Animated.View>
      </Animated.View>

      <View style={styles.wordRow}>
        {WORD.split("").map((char, i) => (
          <Animated.Text
            key={`${char}-${i}`}
            style={[
              styles.letter,
              {
                opacity: letterOpacity[i],
                transform: [{ translateY: letterY[i] }],
                color: RED,
                fontSize: displaySize,
                marginRight: i < WORD.length - 1 ? charGap : 0,
              },
            ]}
          >
            {char}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
  ringHolder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  glowRing: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: RED,
    backgroundColor: "transparent",
  },
  ring: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: RED,
    backgroundColor: "transparent",
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
