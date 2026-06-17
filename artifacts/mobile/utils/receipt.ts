import { Alert, Platform } from "react-native";

import { getApiBaseUrl } from "@/utils/apiBase";

/**
 * Druckt die serverseitige Quittung (identisch zu GET /rides/:id/receipt).
 * Einzige Quelle für HTML — Mobile und API bleiben synchron.
 */
export async function downloadReceipt(rideId: string, sessionToken: string | null | undefined): Promise<void> {
  const id = String(rideId ?? "").trim();
  if (!id) {
    Alert.alert("Nicht verfügbar", "Fahrt-ID fehlt.");
    return;
  }

  const apiBase = getApiBaseUrl();
  const token = String(sessionToken ?? "").trim();
  if (!apiBase || !token) {
    Alert.alert(
      "Anmeldung nötig",
      "Bitte anmelden, um die Quittung vom Server zu laden.",
    );
    return;
  }

  const url = `${apiBase}/rides/${encodeURIComponent(id)}/receipt`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) {
      Alert.alert("Nicht erlaubt", "Diese Quittung gehört nicht zu deinem Konto.");
      return;
    }
    if (!res.ok) {
      Alert.alert("Fehler", "Quittung konnte nicht geladen werden.");
      return;
    }
    html = await res.text();
    if (!html.trim().toLowerCase().includes("<html")) {
      Alert.alert("Fehler", "Ungültige Quittungsantwort vom Server.");
      return;
    }
  } catch {
    Alert.alert("Netzwerkfehler", "Quittung konnte nicht geladen werden. Bitte erneut versuchen.");
    return;
  }

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `quittung-${id.slice(0, 8).toUpperCase()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      Alert.alert("Download nicht möglich", "Bitte Quittung im Browser öffnen.");
    }
    return;
  }

  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html });
  } catch {
    Alert.alert("Drucken nicht verfügbar", "Quittung konnte nicht geöffnet werden.");
  }
}
