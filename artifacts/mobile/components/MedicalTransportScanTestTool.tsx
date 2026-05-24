import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { MedicalScanResultSheet } from "@/components/MedicalScanResultSheet";
import { MedicalTrafficLightCard } from "@/components/MedicalTrafficLightCard";
import { HOME_SHEET_INNER, HOME_SHEET_MUTED, HOME_SHEET_RIM, HOME_SHEET_TEXT } from "@/constants/homeSheetChrome";
import { pickTransportImageBase64 } from "@/utils/medicalScanCapture";
import {
  medicalScanErrorMessageDe,
  postCustomerMedicalTransportScanTest,
  postMedicalTransportScanTest,
  type MedicalScanTestSuccess,
} from "@/utils/medicalScanApi";

const TEST_DISCLAIMER =
  "Testprüfung ohne Fahrt – nicht abrechnungsrelevant. Keine Diagnose, keine Zahlungsgarantie.";

type Props = {
  /** Kunden-Session oder explizites Token */
  authToken?: string;
  /** Fahrer-Fleet-Token (Legacy-Prop) */
  fleetAuthToken?: string;
  /** fleet = Fahrer-App; customer = Kunden-Session */
  scanApi?: "fleet" | "customer";
  variant?: "button" | "card" | "dashboard";
};

export function MedicalTransportScanTestTool({
  fleetAuthToken,
  authToken,
  scanApi = "fleet",
  variant = "button",
}: Props) {
  const sessionToken = (authToken ?? fleetAuthToken ?? "").trim();
  const [busy, setBusy] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanResult, setScanResult] = useState<MedicalScanTestSuccess | null>(null);

  const runScan = useCallback(
    async (fromCamera: boolean) => {
      if (Platform.OS === "web") {
        Alert.alert("Transportschein testen", "Bitte in der nativen App (iOS/Android) testen.");
        return;
      }
      const token = sessionToken;
      if (!token) {
        Alert.alert("Transportschein testen", "Bitte zuerst anmelden.");
        return;
      }
      const b64url = await pickTransportImageBase64(fromCamera);
      if (!b64url) return;
      setBusy(true);
      try {
        const postScan =
          scanApi === "customer" ? postCustomerMedicalTransportScanTest : postMedicalTransportScanTest;
        const result = await postScan({ authToken: token, imageBase64: b64url });
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
        Alert.alert("Transportschein testen", e instanceof Error ? e.message : "Fehler");
      } finally {
        setBusy(false);
      }
    },
    [scanApi, sessionToken],
  );

  const openScanPicker = useCallback(() => {
    if (Platform.OS === "web") {
      Alert.alert("Transportschein testen", "Bitte in der nativen App (iOS/Android) testen.");
      return;
    }
    Alert.alert("Transportschein testen", "Test ohne Fahrt — nichts wird gespeichert.", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Foto aufnehmen", onPress: () => void runScan(true) },
      { text: "Aus Galerie", onPress: () => void runScan(false) },
    ]);
  }, [runScan]);

  const dismissModal = useCallback(() => {
    setScanModalOpen(false);
    setScanResult(null);
  }, []);

  const isCard = variant === "card";
  const isDashboard = variant === "dashboard";

  const actionRow = (
    <View style={isCard ? styles.cardActions : styles.inlineActions}>
      <Pressable
        onPress={() => void runScan(true)}
        disabled={busy}
        style={({ pressed }) => [
          styles.actionBtn,
          styles.actionBtnPrimary,
          isCard && styles.actionBtnFlex,
          pressed && styles.actionBtnPressed,
          busy && styles.actionBtnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Feather name="camera" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>Foto aufnehmen</Text>
          </>
        )}
      </Pressable>
      <Pressable
        onPress={() => void runScan(false)}
        disabled={busy}
        style={({ pressed }) => [
          styles.actionBtn,
          styles.actionBtnSecondary,
          isCard && styles.actionBtnFlex,
          pressed && styles.actionBtnPressed,
          busy && styles.actionBtnDisabled,
        ]}
      >
        <Feather name="image" size={16} color="#111827" />
        <Text style={styles.actionBtnSecondaryText}>Aus Galerie</Text>
      </Pressable>
    </View>
  );

  if (isDashboard) {
    return (
      <>
        <Pressable
          onPress={openScanPicker}
          disabled={busy}
          style={({ pressed }) => [
            styles.dashboardBtn,
            pressed && styles.actionBtnPressed,
            busy && styles.actionBtnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.dashboardBtnText}>🔍 Transportschein testen</Text>
          )}
        </Pressable>

        <MedicalScanResultSheet
          visible={scanModalOpen}
          title="Transportschein — Testprüfung"
          disclaimer={TEST_DISCLAIMER}
          scanApi={scanApi}
          onClose={dismissModal}
        >
          {scanResult ? (
            <MedicalTrafficLightCard
              scanApi={scanApi}
              trafficLight={scanResult.trafficLight}
              warnings={scanResult.warnings}
              insuranceName={scanResult.extracted?.insuranceName}
              transportDate={scanResult.extracted?.transportDate}
              extracted={scanResult.extracted}
              dateLogic={scanResult.dateLogic}
              insuranceRules={scanResult.insuranceRules}
              testDisclaimer={scanApi === "fleet" ? scanResult.testDisclaimer : undefined}
              onPrimaryAction={dismissModal}
            />
          ) : null}
        </MedicalScanResultSheet>
      </>
    );
  }

  return (
    <>
      <View style={isCard ? styles.cardRoot : styles.compactWrap}>
        <View style={isCard ? styles.cardIntroRow : styles.compactHeader}>
          <View style={isCard ? styles.cardIconWrap : styles.compactIconWrap}>
            <MaterialCommunityIcons
              name="file-document-check-outline"
              size={22}
              color={isCard ? "#15803D" : "#1D4ED8"}
            />
          </View>
          <View style={styles.copyBlock}>
            <Text style={isCard ? styles.cardTitle : styles.compactTitle}>🔍 Transportschein testen</Text>
            <Text style={isCard ? styles.cardSub : styles.compactSub}>
              Test ohne Fahrt · OCR · Ampel · Krankenkasse · nichts wird gespeichert
            </Text>
          </View>
        </View>
        {isCard ? <View style={styles.cardDivider} /> : null}
        {actionRow}
      </View>

      <MedicalScanResultSheet
        visible={scanModalOpen}
        title="Transportschein — Testprüfung"
        disclaimer={TEST_DISCLAIMER}
        scanApi={scanApi}
        onClose={dismissModal}
      >
        {scanResult ? (
          <MedicalTrafficLightCard
            scanApi={scanApi}
            trafficLight={scanResult.trafficLight}
            warnings={scanResult.warnings}
            insuranceName={scanResult.extracted?.insuranceName}
            transportDate={scanResult.extracted?.transportDate}
            extracted={scanResult.extracted}
            dateLogic={scanResult.dateLogic}
            insuranceRules={scanResult.insuranceRules}
            testDisclaimer={scanApi === "fleet" ? scanResult.testDisclaimer : undefined}
            onPrimaryAction={dismissModal}
          />
        ) : null}
      </MedicalScanResultSheet>
    </>
  );
}

const styles = StyleSheet.create({
  cardRoot: {
    width: "100%",
    alignSelf: "stretch",
  },
  compactWrap: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  compactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIntroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: HOME_SHEET_INNER,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  compactSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: HOME_SHEET_TEXT,
  },
  cardSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: HOME_SHEET_MUTED,
    marginTop: 3,
    lineHeight: 18,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HOME_SHEET_RIM,
    marginVertical: 12,
    width: "100%",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    minHeight: 46,
  },
  actionBtnFlex: {
    flex: 1,
  },
  actionBtnPrimary: {
    backgroundColor: "#15803D",
  },
  actionBtnSecondary: {
    backgroundColor: HOME_SHEET_INNER,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HOME_SHEET_RIM,
  },
  actionBtnPressed: {
    opacity: 0.92,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  dashboardBtn: {
    backgroundColor: "rgba(17,24,39,0.88)",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  dashboardBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
