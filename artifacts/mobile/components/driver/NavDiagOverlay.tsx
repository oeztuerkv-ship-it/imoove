/**
 * In-App [NavDiag]-Anzeige — nötig weil iOS Store/OTA console.log oft
 * nicht in Konsole.app landet.
 */
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  clearNavDiagBuffer,
  getNavDiagLines,
  getNavDiagTranscript,
  subscribeNavDiag,
} from "@/utils/navRuntimeDiag";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function NavDiagOverlay({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [lines, setLines] = useState(() => getNavDiagLines());
  const scrollRef = useRef<ScrollView>(null);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLines(getNavDiagLines());
    return subscribeNavDiag(() => {
      setLines(getNavDiagLines());
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [visible, lines.length]);

  if (!visible) return null;

  const flash = (msg: string) => {
    setCopiedHint(msg);
    setTimeout(() => setCopiedHint(null), 1600);
  };

  return (
    <View
      style={[styles.wrap, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            NavDiag ({lines.length})
          </Text>
          <View style={styles.headerBtns}>
            <Pressable
              style={styles.btn}
              onPress={() => {
                clearNavDiagBuffer("overlay_clear");
                setLines(getNavDiagLines());
                flash("geleert");
              }}
            >
              <Text style={styles.btnText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={async () => {
                const t = getNavDiagTranscript();
                await Clipboard.setStringAsync(t);
                flash("kopiert");
              }}
            >
              <Text style={styles.btnText}>Copy</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={async () => {
                const t = getNavDiagTranscript();
                try {
                  await Share.share({ message: t, title: "NavDiag" });
                } catch {
                  await Clipboard.setStringAsync(t);
                  flash("kopiert");
                }
              }}
            >
              <Text style={styles.btnText}>Share</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnClose]} onPress={onClose}>
              <Text style={styles.btnText}>✕</Text>
            </Pressable>
          </View>
        </View>
        {copiedHint ? <Text style={styles.hint}>{copiedHint}</Text> : null}
        <Text style={styles.hint}>
          Long-Press Navi-Button zum Öffnen. Nach Szenario: Copy/Share hierher senden.
        </Text>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
        >
          {lines.length === 0 ? (
            <Text style={styles.lineEmpty}>Noch keine Zeilen — Navi starten / fahren.</Text>
          ) : (
            lines.map((line, i) => (
              <Text key={`${i}-${line.slice(0, 24)}`} style={styles.line} selectable>
                {line}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "flex-start",
    paddingHorizontal: 8,
  },
  panel: {
    maxHeight: "72%",
    backgroundColor: "rgba(8,12,10,0.94)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4ADE80",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
    gap: 8,
  },
  title: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  headerBtns: { flexDirection: "row", gap: 6, flexShrink: 0 },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#1E293B",
  },
  btnClose: { backgroundColor: "#7F1D1D" },
  btnText: { color: "#F8FAFC", fontSize: 12, fontWeight: "600" },
  hint: {
    color: "#94A3B8",
    fontSize: 10,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 8, paddingVertical: 6, paddingBottom: 12 },
  line: {
    color: "#E2E8F0",
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 3,
    lineHeight: 12,
  },
  lineEmpty: { color: "#64748B", fontSize: 12, padding: 12 },
});
