import { randomBytes } from "node:crypto";

/** Kryptografisch zufälliger QR-Inhalt — nicht ableitbar aus `ride_id`. */
export function createMedicalQrToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Einheitlicher QR-String für Kundenanzeige und Fahrer-Scan (`ride_id` + Token, Token nicht ersetzbar durch ID allein). */
export function formatMedicalQrPayload(rideId: string, token: string): string {
  return `onroda.medical.v1|${rideId}|${token}`;
}
