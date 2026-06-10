import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Diagnose-Screen: CameraView ohne Transportschein-Bridge/Modal.
 * Route: /camera-test (TestFlight: in Safari onroda://camera-test oder Dev-Menü).
 */
export default function CameraTestScreen() {
  const insets = useSafeAreaInsets();
  const [permissionHook, requestPermissionHook] = useCameraPermissions();
  const [directPerm, setDirectPerm] = useState<string>("pending");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    console.log("[camera-test] mount");
    return () => {
      console.log("[camera-test] unmount");
    };
  }, []);

  useEffect(() => {
    console.log("[camera-test] useCameraPermissions()", permissionHook);
  }, [permissionHook]);

  useEffect(() => {
    void (async () => {
      try {
        const current = await Camera.getCameraPermissionsAsync();
        console.log("[camera-test] Camera.getCameraPermissionsAsync", current);
        setDirectPerm(JSON.stringify(current));
      } catch (err) {
        console.error("[camera-test] getCameraPermissionsAsync failed", err);
        setDirectPerm(String(err));
      }
    })();
  }, []);

  async function onRequestDirect() {
    try {
      const res = await Camera.requestCameraPermissionsAsync();
      console.log("[camera-test] Camera.requestCameraPermissionsAsync", res);
      setDirectPerm(JSON.stringify(res));
    } catch (err) {
      console.error("[camera-test] requestCameraPermissionsAsync failed", err);
    }
  }

  async function onRequestHook() {
    try {
      const res = await requestPermissionHook();
      console.log("[camera-test] requestPermissionHook()", res);
    } catch (err) {
      console.error("[camera-test] requestPermissionHook failed", err);
    }
  }

  const granted = permissionHook?.granted === true;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <ScrollView contentContainerStyle={styles.info} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Kamera-Test (ohne Bridge)</Text>
        <Text style={styles.mono}>hook: {JSON.stringify(permissionHook)}</Text>
        <Text style={styles.mono}>direct: {directPerm}</Text>
        <Text style={styles.mono}>onCameraReady: {String(cameraReady)}</Text>
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={() => void onRequestDirect()}>
            <Text style={styles.btnText}>Camera.request…</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => void onRequestHook()}>
            <Text style={styles.btnText}>Hook request</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
          <Text style={styles.btnTextDark}>Zurück</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.preview}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => {
              console.log("[camera-test] onCameraReady");
              setCameraReady(true);
            }}
          />
        ) : (
          <View style={styles.wait}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.waitText}>Keine Kamera-Berechtigung (hook.granted=false)</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  info: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#0f172a" },
  mono: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#334155" },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  btnGhost: { backgroundColor: "#e2e8f0", marginTop: 4 },
  btnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnTextDark: { color: "#0f172a", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  preview: { flex: 1, margin: 16, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  wait: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  waitText: { color: "#e2e8f0", fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "center" },
});
