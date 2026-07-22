import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  acceptDriverPrebookGuidelines,
} from "@/utils/driverPrebookGuidelinesConsent";

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
    key: "online-30",
    icon: <MaterialCommunityIcons name="car" size={24} color="#111827" />,
    title: "30 min vorher",
    body: "Du musst 30 Minuten vor der Abholzeit die App geöffnet haben und online sein.",
  },
  {
    key: "activate",
    icon: <MaterialCommunityIcons name="steering" size={24} color="#111827" />,
    title: "Benachrichtigung",
    body: "Aktiviere die Vorbestellung und fahre zum Abholpunkt.",
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
  /** Fleet-Fahrer-ID — nötig zum Speichern der Bestätigung. */
  driverId: string;
  alreadyAccepted: boolean;
  onAccepted: () => void;
};

/** Richtlinien Vorbestellungen — Bestätigung schützt vor Annahme ohne Kenntnis der Regeln. */
export function DriverPrebookGuidelinesModal({
  visible,
  onClose,
  driverId,
  alreadyAccepted,
  onAccepted,
}: Props) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    if (alreadyAccepted) {
      onClose();
      return;
    }
    const id = driverId.trim();
    if (!id || saving) return;
    setSaving(true);
    try {
      await acceptDriverPrebookGuidelines(id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAccepted();
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
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

        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          {alreadyAccepted ? (
            <View style={styles.acceptedBadge}>
              <Feather name="check-circle" size={18} color="#15803D" />
              <Text style={styles.acceptedBadgeText}>Bereits bestätigt</Text>
            </View>
          ) : (
            <Text style={styles.footerHint}>
              Mit „Akzeptiert“ bestätigst du, dass du die Regeln kennst. Ohne Bestätigung kannst du keine
              Vorbestellungen annehmen oder aktivieren.
            </Text>
          )}
          <Pressable
            onPress={() => void handleAccept()}
            disabled={saving}
            style={({ pressed }) => [
              styles.acceptBtn,
              alreadyAccepted ? styles.acceptBtnSecondary : null,
              (pressed || saving) && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={alreadyAccepted ? "Schließen" : "Richtlinien akzeptieren"}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                {!alreadyAccepted ? <Feather name="check" size={20} color="#FFFFFF" /> : null}
                <Text style={styles.acceptBtnText}>{alreadyAccepted ? "Schließen" : "Akzeptiert"}</Text>
              </>
            )}
          </Pressable>
        </View>
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
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: "#FFFFFF",
  },
  footerHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginBottom: 12,
  },
  acceptedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  acceptedBadgeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#15803D",
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 54,
  },
  acceptBtnSecondary: {
    backgroundColor: "#111827",
  },
  acceptBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
