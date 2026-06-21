import { Alert, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { getApiBaseUrl } from "@/utils/apiBase";

function receiptPdfFileName(rideId: string): string {
  return `quittung-${String(rideId).trim().slice(0, 8).toUpperCase()}.pdf`;
}

async function savePdfBytesToCache(fileName: string, bytes: Uint8Array): Promise<File> {
  const outFile = new File(Paths.cache, fileName);
  if (outFile.exists) {
    outFile.delete();
  }
  outFile.create({ overwrite: true });
  outFile.write(bytes);
  return outFile;
}

function alertReceiptHttpError(status: number): void {
  if (status === 401 || status === 403) {
    Alert.alert("Nicht erlaubt", "Diese Quittung gehört nicht zu deinem Konto.");
    return;
  }
  if (status === 404) {
    Alert.alert("Nicht verfügbar", "Quittung nicht gefunden. Nur abgeschlossene Fahrten haben eine PDF-Quittung.");
    return;
  }
  Alert.alert("Fehler", `Quittung konnte nicht geladen werden (${status}).`);
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

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      alertReceiptHttpError(res.status);
      return;
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      Alert.alert("Fehler", "Server hat keine PDF geliefert.");
      return;
    }

    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    if (pdfBytes.length < 64) {
      Alert.alert("Fehler", "PDF-Datei ist leer oder ungültig.");
      return;
    }

    if (Platform.OS === "web") {
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      return;
    }

    const outFile = await savePdfBytesToCache(fileName, pdfBytes);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(outFile.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Quittung speichern",
      });
      return;
    }

    Alert.alert("Quittung bereit", "Die PDF wurde erstellt. Teilen ist auf diesem Gerät nicht verfügbar.");
  } catch (err) {
    const detail = err instanceof Error ? err.message.trim() : "";
    Alert.alert(
      "Speichern fehlgeschlagen",
      detail ? `Die Quittung konnte nicht gespeichert werden: ${detail}` : "Die Quittung konnte nicht als PDF gespeichert werden.",
    );
  }
}
