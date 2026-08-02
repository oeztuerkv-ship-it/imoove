/**
 * Fahrer-Profilfoto: Server-Upload + Privacy-Consent für Kundenanzeige.
 * Lokal nur Cache für snappige Preview; Quelle der Wahrheit ist die API.
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { getApiBaseUrl } from "@/utils/apiBase";

const AVATAR_MAX_WIDTH = 720;
const AVATAR_JPEG_QUALITY = 0.82;

export type DriverAvatarState = {
  avatarHasPhoto: boolean;
  avatarShowToCustomer: boolean;
  avatarPreviewUrl: string | null;
  avatarCustomerUrl: string | null;
};

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseAvatarPayload(data: Record<string, unknown>): DriverAvatarState {
  return {
    avatarHasPhoto: data.avatarHasPhoto === true,
    avatarShowToCustomer: data.avatarShowToCustomer === true,
    avatarPreviewUrl:
      typeof data.avatarPreviewUrl === "string" && data.avatarPreviewUrl.trim()
        ? data.avatarPreviewUrl.trim()
        : null,
    avatarCustomerUrl:
      typeof data.avatarCustomerUrl === "string" && data.avatarCustomerUrl.trim()
        ? data.avatarCustomerUrl.trim()
        : null,
  };
}

async function pickAvatarDataUrl(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      fromCamera ? "Kamera" : "Fotos",
      fromCamera
        ? "Kamerazugriff wird für das Profilfoto benötigt."
        : "Zugriff auf Fotos wird für das Profilfoto benötigt.",
    );
    return null;
  }

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    allowsEditing: true,
    aspect: [1, 1],
    base64: false,
  };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: AVATAR_MAX_WIDTH } }],
      {
        compress: AVATAR_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!manipulated.base64) return null;
    return `data:image/jpeg;base64,${manipulated.base64}`;
  } catch {
    Alert.alert("Profilfoto", "Foto konnte nicht verarbeitet werden.");
    return null;
  }
}

export async function uploadDriverAvatar(
  authToken: string,
  fromCamera: boolean,
): Promise<DriverAvatarState | null> {
  const token = authToken.trim();
  if (!token) {
    Alert.alert("Profilfoto", "Fahrer-Session fehlt.");
    return null;
  }
  const imageBase64 = await pickAvatarDataUrl(fromCamera);
  if (!imageBase64) return null;

  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/fleet-driver/v1/avatar`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ imageBase64 }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      const err = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      Alert.alert("Profilfoto", `Upload fehlgeschlagen (${err}).`);
      return null;
    }
    return parseAvatarPayload(data);
  } catch {
    Alert.alert("Profilfoto", "Keine Verbindung zum Server.");
    return null;
  }
}

export async function patchDriverAvatarConsent(
  authToken: string,
  showToCustomer: boolean,
): Promise<DriverAvatarState | null> {
  const token = authToken.trim();
  if (!token) return null;
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/fleet-driver/v1/avatar`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ showToCustomer }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      const err = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      if (err === "avatar_required") {
        Alert.alert("Profilfoto", "Bitte zuerst ein Foto hochladen.");
      } else {
        Alert.alert("Profilfoto", `Einstellung konnte nicht gespeichert werden (${err}).`);
      }
      return null;
    }
    return parseAvatarPayload(data);
  } catch {
    Alert.alert("Profilfoto", "Keine Verbindung zum Server.");
    return null;
  }
}

export async function deleteDriverAvatar(authToken: string): Promise<DriverAvatarState | null> {
  const token = authToken.trim();
  if (!token) return null;
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/fleet-driver/v1/avatar`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      Alert.alert("Profilfoto", "Foto konnte nicht entfernt werden.");
      return null;
    }
    return parseAvatarPayload(data);
  } catch {
    Alert.alert("Profilfoto", "Keine Verbindung zum Server.");
    return null;
  }
}

/** Auswahl-Dialog Galerie / Kamera / Entfernen. */
export function promptDriverAvatarActions(
  authToken: string,
  hasPhoto: boolean,
  onDone: (state: DriverAvatarState | null) => void,
): void {
  const buttons: {
    text: string;
    style?: "cancel" | "destructive" | "default";
    onPress?: () => void;
  }[] = [
    {
      text: "Galerie",
      onPress: () => {
        void (async () => {
          const state = await uploadDriverAvatar(authToken, false);
          onDone(state);
        })();
      },
    },
    {
      text: "Kamera",
      onPress: () => {
        void (async () => {
          const state = await uploadDriverAvatar(authToken, true);
          onDone(state);
        })();
      },
    },
  ];
  if (hasPhoto) {
    buttons.push({
      text: "Foto entfernen",
      style: "destructive",
      onPress: () => {
        void (async () => {
          const state = await deleteDriverAvatar(authToken);
          onDone(state);
        })();
      },
    });
  }
  buttons.push({ text: "Abbrechen", style: "cancel" });
  Alert.alert(
    "Profilfoto",
    "Foto wird auf dem Server gespeichert. Kunden sehen es nur, wenn Sie die Anzeige freigeben.",
    buttons,
  );
}
