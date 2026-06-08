import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  completeTransportscheinCameraCapture,
  getPendingTransportscheinCaptureOpts,
  subscribeTransportscheinCameraCapture,
} from "@/utils/transportscheinCameraCaptureBridge";
import { compressTransportImageUri } from "@/utils/medicalScanCapture";

type Step = "camera" | "preview";

/**
 * Ersetzt den nativen iOS-Dialog „Retake“ / „Use Photo“ durch deutsche Buttons.
 */
export function TransportscheinCameraHost() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("camera");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    return subscribeTransportscheinCameraCapture(setOpen);
  }, []);

  const resetAndClose = useCallback(() => {
    setStep("camera");
    setPreviewUri(null);
    setCameraReady(false);
    setBusy(false);
    completeTransportscheinCameraCapture(null);
  }, []);

  const onUsePhoto = useCallback(async () => {
    if (!previewUri) return;
    setBusy(true);
    const opts = getPendingTransportscheinCaptureOpts();
    const dataUrl = await compressTransportImageUri(previewUri, opts);
    setBusy(false);
    setStep("camera");
    setPreviewUri(null);
    setCameraReady(false);
    if (!dataUrl) {
      Alert.alert("Transportschein", "Foto konnte nicht verarbeitet werden. Bitte erneut versuchen.");
      completeTransportscheinCameraCapture(null);
      return;
    }
    completeTransportscheinCameraCapture(dataUrl);
  }, [previewUri]);

  const onShutter = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!photo?.uri) {
        Alert.alert("Transportschein", "Foto konnte nicht aufgenommen werden.");
        return;
      }
      setPreviewUri(photo.uri);
      setStep("preview");
    } catch {
      Alert.alert("Transportschein", "Foto konnte nicht aufgenommen werden.");
    } finally {
      setBusy(false);
    }
  }, [cameraReady, busy]);

  useEffect(() => {
    if (!open || Platform.OS === "web") return;
    if (permission?.granted) return;
    void requestPermission().then((res) => {
      if (!res?.granted) {
        Alert.alert(
          "Kamera",
          res?.canAskAgain === false
            ? "Bitte Kamerazugriff in den iOS-Einstellungen für ONRODA erlauben."
            : "Zugriff wird benötigt.",
        );
        resetAndClose();
      }
    });
  }, [open, permission?.granted, requestPermission, resetAndClose]);

  if (Platform.OS === "web") return null;

  return (
    <Modal visible={open} animationType="slide" onRequestClose={resetAndClose}>
      <View style={styles.root}>
        {step === "camera" ? (
          <>
            {permission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                onCameraReady={() => setCameraReady(true)}
              />
            ) : (
              <View style={styles.centered}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.permissionHint}>
                  {permission == null ? "Kamera wird vorbereitet…" : "Kamerazugriff wird angefragt…"}
                </Text>
              </View>
            )}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Text style={styles.title}>Transportschein scannen</Text>
            </View>
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable
                onPress={resetAndClose}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={() => void onShutter()}
                style={({ pressed }) => [styles.shutterBtn, pressed && styles.pressed, busy && styles.disabled]}
                disabled={!permission?.granted || !cameraReady || busy}
              >
                {busy ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.shutterBtnText}>Aufnehmen</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : null}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Text style={styles.title}>Vorschau</Text>
            </View>
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable
                onPress={() => {
                  setPreviewUri(null);
                  setStep("camera");
                  setCameraReady(false);
                }}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnText}>Neu aufnehmen</Text>
              </Pressable>
              <Pressable
                onPress={() => void onUsePhoto()}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, busy && styles.disabled]}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Foto verwenden</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  permissionHint: { color: "#e2e8f0", fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 8 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  title: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  secondaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#0f172a" },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#16a34a",
    alignItems: "center",
  },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  shutterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  shutterBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#0f172a" },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
});
