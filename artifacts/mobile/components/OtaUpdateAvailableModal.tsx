import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Phase = "prompt" | "progress";

type Props = {
  visible: boolean;
  /** Nach Fortschritt 0–100 % — Caller lädt OTA und zeigt danach „installiert“. */
  onContinue: () => void;
};

const PROGRESS_MS = 1600;
const TICK_MS = 32;

/**
 * OTA gefunden: Hinweis → „Weiter“ → Fortschrittsbalken → onContinue (Download).
 * Gleiches Aufbau-Muster wie `OtaUpdateInstalledModal` (nur Texte anders).
 */
export function OtaUpdateAvailableModal({ visible, onContinue }: Props) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [percent, setPercent] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    if (!visible) {
      setPhase("prompt");
      setPercent(0);
      startedRef.current = false;
      finishedRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || phase !== "progress") return;

    finishedRef.current = false;
    setPercent(0);
    const startedAt = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(100, Math.round((elapsed / PROGRESS_MS) * 100));
      setPercent(next);
      if (next >= 100) {
        clearInterval(timer);
        if (finishedRef.current) return;
        finishedRef.current = true;
        setTimeout(() => {
          onContinueRef.current();
        }, 200);
      }
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [visible, phase]);

  const handleWeiter = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("progress");
  };

  const fillWidth = trackWidth > 0 ? (trackWidth * percent) / 100 : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Neue Version verfügbar</Text>
          <Text style={styles.body}>Ein Update steht bereit und wird als Nächstes installiert.</Text>

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
              <View
                style={styles.track}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0 && Math.abs(w - trackWidth) > 0.5) setTrackWidth(w);
                }}
              >
                <View style={[styles.fill, { width: fillWidth }]} />
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
    alignItems: "stretch",
    width: "100%",
  },
  track: {
    width: "100%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#e8e8e8",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#111",
  },
  percent: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
    textAlign: "center",
  },
});
