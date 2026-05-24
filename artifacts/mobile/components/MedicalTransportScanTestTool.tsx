import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { MedicalScanResultSheet } from "@/components/MedicalScanResultSheet";
import { MedicalTrafficLightCard } from "@/components/MedicalTrafficLightCard";
import { pickTransportImageBase64 } from "@/utils/medicalScanCapture";
import {
  medicalScanErrorMessageDe,
  postMedicalTransportScanTest,
  type MedicalScanTestSuccess,
} from "@/utils/medicalScanApi";

const TEST_DISCLAIMER =
  "Testprüfung ohne Fahrt – nicht abrechnungsrelevant. Keine Diagnose, keine Zahlungsgarantie.";

type Props = {
  fleetAuthToken: string;
  variant?: "button" | "card";
};

export function MedicalTransportScanTestTool({ fleetAuthToken, variant = "button" }: Props) {
  const [busy, setBusy] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanResult, setScanResult] = useState<MedicalScanTestSuccess | null>(null);

  const runScan = useCallback(
    async (fromCamera: boolean) => {
      if (Platform.OS === "web") {
        Alert.alert("Transportschein prüfen", "Bitte in der nativen App (iOS/Android) testen.");
        return;
      }
      const token = fleetAuthToken.trim();
      if (!token) {
        Alert.alert("Transportschein prüfen", "Fahrer-Session fehlt. Bitte neu anmelden.");
        return;
      }
      const b64url = await pickTransportImageBase64(fromCamera);
      if (!b64url) return;
      setBusy(true);
      try {
        const result = await postMedicalTransportScanTest({ authToken: token, imageBase64: b64url });
        if (!result.ok) {
          throw new Error(medicalScanErrorMessageDe(result.error));
        }
        setScanResult(result);
        setScanModalOpen(true);
        Haptics.notificationAsync(
          result.trafficLight === "green"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      } catch (e) {
        Alert.alert("Transportschein prüfen", e instanceof Error ? e.message : "Fehler");
      } finally {
        setBusy(false);
      }
    },
    [fleetAuthToken],
  );

  const dismissModal = useCallback(() => {
    setScanModalOpen(false);
    setScanResult(null);
  }, []);

  const actionRow = (
    <View style={variant === "card" ? styles.cardActions : styles.inlineActions}>
      <Pressable
        onPress={() => void runScan(true)}
        disabled={busy}
        style={({ pressed }) => [
          styles.actionChip,
          styles.actionChipPrimary,
          variant === "card" && { flex: 1 },
          { opacity: pressed ? 0.9 : busy ? 0.55 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#166534" />
        ) : (
          <Text style={styles.actionChipPrimaryText}>Foto aufnehmen</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => void runScan(false)}
        disabled={busy}
        style={({ pressed }) => [
          styles.actionChip,
          variant === "card" && { flex: 1 },
          { opacity: pressed ? 0.9 : busy ? 0.55 : 1 },
        ]}
      >
        <Text style={styles.actionChipText}>Foto hochladen</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <View style={variant === "card" ? undefined : styles.compactWrap}>
        <View style={variant === "card" ? styles.cardHeader : styles.compactHeader}>
          <MaterialCommunityIcons
            name="file-document-check-outline"
            size={variant === "card" ? 22 : 18}
            color={variant === "card" ? "#166534" : "#1D4ED8"}
          />
          <View style={{ flex: 1 }}>
            <Text style={variant === "card" ? styles.cardTitle : styles.compactTitle}>Transportschein prüfen</Text>
            <Text style={variant === "card" ? styles.cardSub : styles.compactSub}>
              Test ohne Fahrt · OCR · Ampel · Krankenkasse
            </Text>
          </View>
        </View>
        {actionRow}
      </View>

      <MedicalScanResultSheet
        visible={scanModalOpen}
        title="Transportschein — Testprüfung"
        disclaimer={TEST_DISCLAIMER}
        onClose={dismissModal}
      >
        {scanResult ? (
          <MedicalTrafficLightCard
            trafficLight={scanResult.trafficLight}
            warnings={scanResult.warnings}
            insuranceName={scanResult.extracted?.insuranceName}
            transportDate={scanResult.extracted?.transportDate}
            extracted={scanResult.extracted}
            dateLogic={scanResult.dateLogic}
            insuranceRules={scanResult.insuranceRules}
            testDisclaimer={scanResult.testDisclaimer}
            onPrimaryAction={dismissModal}
          />
        ) : null}
      </MedicalScanResultSheet>
    </>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  compactTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#1E3A8A",
  },
  compactSub: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#166534",
  },
  cardSub: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
    marginTop: 3,
    lineHeight: 17,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 6,
  },
  actionChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  actionChipPrimary: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  actionChipPrimaryText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#166534",
  },
  actionChipText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#1E40AF",
  },
});
