import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Phase = "prompt" | "progress";

type Props = {
  visible: boolean;
  onContinue: () => void;
};

const PROGRESS_MS = 1400;

/**
 * Nach OTA-Download: Hinweis → „Weiter“ → Fortschrittsbalken 0–100 % → Reload (Caller).
 */
export function OtaUpdateInstalledModal({ visible, onContinue }: Props) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [percent, setPercent] = useState(0);
  const widthAnim = useRef(new Animated.Value(0)).current;
  const startedRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    if (!visible) {
      setPhase("prompt");
      setPercent(0);
      widthAnim.setValue(0);
      startedRef.current = false;
    }
  }, [visible, widthAnim]);

  useEffect(() => {
    if (!visible || phase !== "progress") return;
    widthAnim.setValue(0);
    setPercent(0);
    const id = widthAnim.addListener(({ value }) => {
      setPercent(Math.min(100, Math.round(value)));
    });
    Animated.timing(widthAnim, {
      toValue: 100,
      duration: PROGRESS_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      widthAnim.removeListener(id);
      if (finished) {
        setPercent(100);
        onContinueRef.current();
      }
    });
    return () => {
      widthAnim.stopAnimation();
      widthAnim.removeListener(id);
    };
  }, [visible, phase, widthAnim]);

  const handleWeiter = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("progress");
  };

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Update erfolgreich installiert</Text>
          <Text style={styles.body}>Die App wird jetzt neu gestartet.</Text>

          {phase === "prompt" ? (
            <Pressable
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              onPress={handleWeiter}
              accessibilityRole="button"
              accessibilityLabel="Weiter"
            >
              <Text style={styles.btnText}>Weiter</Text>
            </Pressable>
          ) : (
            <View style={styles.progressBlock}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { width: barWidth }]} />
              </View>
              <Text style={styles.percent}>{percent}%</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#111",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  btn: {
    marginTop: 4,
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPressed: { opacity: 0.85 },
  btnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  progressBlock: {
    marginTop: 8,
    gap: 10,
    alignItems: "center",
  },
  track: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e8e8e8",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#111",
  },
  percent: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
  },
});
