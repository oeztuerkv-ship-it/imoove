import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { Alert, Platform } from "react-native";

import { requestTransportscheinCameraCapture } from "@/utils/transportscheinCameraCaptureBridge";

/** Lange Seite max. — OCR reicht; verhindert 6MB-JSON-Limit auf der API. */
const MEDICAL_SCAN_MAX_WIDTH = 2000;
const MEDICAL_SCAN_JPEG_QUALITY = 0.72;

export type PickTransportImageOptions = {
  maxWidth?: number;
  jpegQuality?: number;
};

export async function compressTransportImageUri(
  uri: string,
  opts?: PickTransportImageOptions,
): Promise<string | null> {
  const maxWidth = opts?.maxWidth ?? MEDICAL_SCAN_MAX_WIDTH;
  const jpegQuality = opts?.jpegQuality ?? MEDICAL_SCAN_JPEG_QUALITY;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      {
        compress: jpegQuality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) return null;
    return `data:image/jpeg;base64,${result.base64}`;
  } catch {
    return null;
  }
}

/** Kamera-Berechtigung vor Modal (wie Fahrer-QR-Scan) — verhindert hängenden Ladeindikator. */
async function ensureTransportCameraPermission(): Promise<boolean> {
  try {
    const current = await Camera.getCameraPermissionsAsync();
    console.log("[medicalScanCapture] getCameraPermissionsAsync", current);
    const resolved = current.granted ? current : await Camera.requestCameraPermissionsAsync();
    console.log("[medicalScanCapture] requestCameraPermissionsAsync", resolved);
    if (resolved.granted) return true;
    Alert.alert(
      "Kamera",
      resolved.canAskAgain === false
        ? "Bitte Kamerazugriff in den iOS-Einstellungen für ONRODA erlauben."
        : "Kamerazugriff wird benötigt.",
    );
    return false;
  } catch (err) {
    console.error("[medicalScanCapture] ensureTransportCameraPermission failed", err);
    Alert.alert("Kamera", "Kamerazugriff konnte nicht geprüft werden.");
    return false;
  }
}

/** Kamera oder Galerie — komprimierte Base64 data-URL für Medical-Scan-API. */
export async function pickTransportImageBase64(
  fromCamera: boolean,
  compressOpts?: PickTransportImageOptions,
): Promise<string | null> {
  if (fromCamera && Platform.OS !== "web") {
    const allowed = await ensureTransportCameraPermission();
    if (!allowed) return null;
    return requestTransportscheinCameraCapture(compressOpts);
  }

  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(fromCamera ? "Kamera" : "Fotos", "Zugriff wird benötigt.");
    return null;
  }
  const pickerOpts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  };
  const r = fromCamera
    ? await ImagePicker.launchCameraAsync(pickerOpts)
    : await ImagePicker.launchImageLibraryAsync(pickerOpts);
  if (r.canceled || !r.assets?.[0]?.uri) return null;
  const dataUrl = await compressTransportImageUri(r.assets[0].uri, compressOpts);
  if (!dataUrl) {
    Alert.alert("Transportschein", "Foto konnte nicht verarbeitet werden. Bitte erneut versuchen.");
    return null;
  }
  return dataUrl;
}
