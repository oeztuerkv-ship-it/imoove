import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

/** Kamera oder Galerie — Base64 data-URL für Medical-Scan-API. */
export async function pickTransportImageBase64(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(fromCamera ? "Kamera" : "Fotos", "Zugriff wird benötigt.");
    return null;
  }
  const r = fromCamera
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
      });
  if (r.canceled || !r.assets?.[0]?.base64) return null;
  const mime = r.assets[0].mimeType ?? "image/jpeg";
  return `data:${mime};base64,${r.assets[0].base64}`;
}
