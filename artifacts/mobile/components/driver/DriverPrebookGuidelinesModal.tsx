import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    key: "cancel-60",
    icon: <Feather name="slash" size={22} color="#111827" />,
    title: "60 min vorher",
    body: "Storniere nicht weniger als 60 Minuten vor der Abholzeit.",
  },
  {
    key: "online-45",
    icon: <MaterialCommunityIcons name="car" size={24} color="#111827" />,
    title: "45 min vorher",
    body: "Du musst spätestens 45 Minuten vor der Abholzeit die App geöffnet haben und online sein.",
  },
  {
    key: "activate",
    icon: <MaterialCommunityIcons name="steering" size={24} color="#111827" />,
    title: "45–25 min vorher",
    body: "Aktiviere die Vorbestellung zwischen 45 und 25 Minuten vor Abholung — du hast 20 Minuten Zeit.",
  },
  {
    key: "deadline-25",
    icon: <Feather name="alert-circle" size={22} color="#111827" />,
    title: "25 min vorher",
    body: "Spätestens bis 25 Minuten vor Abholung muss aktiviert sein — sonst wird die Fahrt freigegeben und du bist 24 Stunden gesperrt.",
  },
  {
    key: "punctual",
    icon: <Feather name="clock" size={22} color="#111827" />,
    title: "Pünktlich",
    body: "Sei pünktlich am Abholpunkt, andernfalls verlierst du deine Vorbestellung und wirst für künftige Vorbestellungen gesperrt.",
  },
];

function TimelineStep({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={styles.stepIconWrap}>{step.icon}</View>
        {!isLast ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={[styles.stepBody, isLast ? styles.stepBodyLast : null]}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepText}>{step.body}</Text>
      </View>
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Richtlinien Vorbestellungen — Layout wie Referenz (Timeline, Vollbild lesen). */
export function DriverPrebookGuidelinesModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
        >
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Schließen"
            hitSlop={12}
          >
            <Feather name="x" size={22} color="#E11D2E" />
          </Pressable>

          <Text style={styles.headline}>So vermeidest du, für Vorbestellungen gesperrt zu werden</Text>
          <Text style={styles.lead}>
            Wir verfolgen deinen Standort, um sicherzustellen, dass alles pünktlich klappt.
          </Text>

          <View style={styles.timeline}>
            {STEPS.map((step, index) => (
              <TimelineStep key={step.key} step={step} isLast={index === STEPS.length - 1} />
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headline: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 14,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    color: "#374151",
    marginBottom: 28,
  },
  timeline: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepRail: {
    width: 44,
    alignItems: "center",
    marginRight: 14,
  },
  stepIconWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    width: 2,
    flex: 1,
    minHeight: 36,
    backgroundColor: "#D1D5DB",
    marginVertical: 4,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 28,
    minWidth: 0,
  },
  stepBodyLast: {
    paddingBottom: 8,
  },
  stepTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 6,
  },
  stepText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    color: "#374151",
  },
});
