import { Alert, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { getApiBaseUrl } from "@/utils/apiBase";

function receiptPdfFileName(rideId: string): string {
  return `quittung-${String(rideId).trim().slice(0, 8).toUpperCase()}.pdf`;
}

/**
 * Lädt die serverseitige PDF-Quittung (GET /rides/:id/receipt.pdf) und speichert sie als Datei.
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
    Alert.alert("Anmeldung nötig", "Bitte anmelden, um die Quittung vom Server zu laden.");
    return;
  }

  const url = `${apiBase}/rides/${encodeURIComponent(id)}/receipt.pdf`;
  const fileName = receiptPdfFileName(id);

  if (Platform.OS === "web") {
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
      const pdfBytes = await res.arrayBuffer();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      Alert.alert("Download nicht möglich", "PDF konnte nicht heruntergeladen werden.");
    }
    return;
  }

  try {
    const file = new File(Paths.cache, fileName);
    await File.downloadFileAsync(url, file, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Quittung speichern",
      });
      return;
    }

    Alert.alert("Quittung bereit", "Die PDF wurde erstellt. Teilen ist auf diesem Gerät nicht verfügbar.");
  } catch {
    Alert.alert("Speichern fehlgeschlagen", "Die Quittung konnte nicht als PDF gespeichert werden.");
  }
}
