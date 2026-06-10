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
import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  completeTransportscheinCameraCapture,
  getPendingTransportscheinCaptureOpts,
  subscribeTransportscheinCameraCapture,
} from "@/utils/transportscheinCameraCaptureBridge";
import { compressTransportImageUri } from "@/utils/medicalScanCapture";

type Step = "camera" | "preview";
type PermPhase = "idle" | "checking" | "granted" | "denied";

const LOG_PREFIX = "[TransportscheinCameraHost]";

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
  const [permPhase, setPermPhase] = useState<PermPhase>("idle");
  const cameraRef = useRef<CameraView>(null);
  const [permissionHook, requestPermissionHook] = useCameraPermissions();

  useEffect(() => {
    console.log(`${LOG_PREFIX} mount`, { platform: Platform.OS });
    return () => {
      console.log(`${LOG_PREFIX} unmount`);
    };
  }, []);

  useEffect(() => {
    console.log(`${LOG_PREFIX} useCameraPermissions()`, permissionHook);
  }, [permissionHook]);

  useEffect(() => {
    return subscribeTransportscheinCameraCapture((nextOpen) => {
      console.log(`${LOG_PREFIX} bridge open=`, nextOpen);
      setOpen(nextOpen);
    });
  }, []);

  useEffect(() => {
    console.log(`${LOG_PREFIX} state`, { open, step, permPhase, cameraReady, busy });
  }, [open, step, permPhase, cameraReady, busy]);

  const resetAndClose = useCallback(() => {
    console.log(`${LOG_PREFIX} resetAndClose`);
    setStep("camera");
    setPreviewUri(null);
    setCameraReady(false);
    setBusy(false);
    setPermPhase("idle");
    completeTransportscheinCameraCapture(null);
  }, []);

  useEffect(() => {
    if (!open || Platform.OS === "web") {
      setPermPhase("idle");
      return;
    }

    let cancelled = false;
    setPermPhase("checking");
    setCameraReady(false);

    void (async () => {
      try {
        console.log(`${LOG_PREFIX} resolvePermission start`, {
          hookGranted: permissionHook?.granted ?? null,
          hookStatus: permissionHook?.status ?? null,
        });

        let resolved = await Camera.getCameraPermissionsAsync();
        console.log(`${LOG_PREFIX} Camera.getCameraPermissionsAsync`, resolved);

        if (!resolved.granted) {
          resolved = await Camera.requestCameraPermissionsAsync();
          console.log(`${LOG_PREFIX} Camera.requestCameraPermissionsAsync`, resolved);
        }

        if (!resolved.granted && requestPermissionHook) {
          const hookResult = await requestPermissionHook();
          console.log(`${LOG_PREFIX} requestPermissionHook()`, hookResult);
          if (hookResult?.granted) {
            resolved = hookResult;
          }
        }

        if (cancelled) return;

        if (resolved.granted) {
          console.log(`${LOG_PREFIX} permission granted → show CameraView`);
          setPermPhase("granted");
          return;
        }

        console.error(`${LOG_PREFIX} permission denied`, resolved);
        setPermPhase("denied");
        Alert.alert(
          "Kamera",
          resolved.canAskAgain === false
            ? "Bitte Kamerazugriff in den iOS-Einstellungen für ONRODA erlauben."
            : "Kamerazugriff wird benötigt.",
        );
        resetAndClose();
      } catch (err) {
        console.error(`${LOG_PREFIX} permission resolve failed`, err);
        if (cancelled) return;
        setPermPhase("denied");
        Alert.alert("Kamera", "Kamerazugriff konnte nicht geprüft werden.");
        resetAndClose();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resetAndClose]);

  const onUsePhoto = useCallback(async () => {
    if (!previewUri) return;
    setBusy(true);
    const opts = getPendingTransportscheinCaptureOpts();
    const dataUrl = await compressTransportImageUri(previewUri, opts);
    setBusy(false);
    setStep("camera");
    setPreviewUri(null);
    setCameraReady(false);
    setPermPhase("idle");
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
      console.log(`${LOG_PREFIX} takePictureAsync`, { hasUri: Boolean(photo?.uri) });
      if (!photo?.uri) {
        Alert.alert("Transportschein", "Foto konnte nicht aufgenommen werden.");
        return;
      }
      setPreviewUri(photo.uri);
      setStep("preview");
    } catch (err) {
      console.error(`${LOG_PREFIX} takePictureAsync failed`, err);
      Alert.alert("Transportschein", "Foto konnte nicht aufgenommen werden.");
    } finally {
      setBusy(false);
    }
  }, [cameraReady, busy]);

  if (Platform.OS === "web") return null;

  const showCamera = step === "camera" && permPhase === "granted";
  const showPermissionWait = step === "camera" && permPhase !== "granted";

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={resetAndClose}
    >
      <View style={styles.root}>
        {showCamera ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => {
              console.log(`${LOG_PREFIX} onCameraReady`);
              setCameraReady(true);
            }}
          />
        ) : null}
        {showPermissionWait ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.permissionHint}>
              {permPhase === "checking"
                ? "Kamerazugriff wird geprüft…"
                : permissionHook == null
                  ? "Kamera wird vorbereitet…"
                  : "Kamerazugriff wird angefragt…"}
            </Text>
            {__DEV__ ? (
              <Text style={styles.debugHint}>
                hook={JSON.stringify(permissionHook)} phase={permPhase}
              </Text>
            ) : null}
          </View>
        ) : null}
        {step === "camera" ? (
          <>
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
                disabled={!showCamera || !cameraReady || busy}
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
                  if (permPhase !== "granted") setPermPhase("checking");
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  permissionHint: { color: "#e2e8f0", fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 8, textAlign: "center" },
  debugHint: { color: "#94a3b8", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
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
