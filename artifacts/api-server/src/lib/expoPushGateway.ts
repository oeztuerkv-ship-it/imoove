import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * iOS: Custom-Sound inkl. Dateiendung (z. B. `ride_alert.caf`), sonst oft nur System-Beep.
   * Android: Ton kommt vom Notification-Channel (`channelId`).
   */
  sound?: string | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  /** iOS 15+: Focus/Durchsage — `time-sensitive` best-effort ohne Critical-Entitlement. */
  interruptionLevel?: "active" | "critical" | "passive" | "time-sensitive";
  /** Sekunden TTL; hohe Priority + ausreichend TTL für Doze. */
  ttl?: number;
};

/**
 * Sendet über die Expo Push API (kein Secret nötig; optional EXPO_ACCESS_TOKEN für höhere Limits).
 */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const accessToken = (process.env.EXPO_ACCESS_TOKEN ?? "").trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const body = messages.length === 1 ? messages[0]! : messages;
    const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, snippet: text.slice(0, 400) }, "[expo-push] send non-ok");
    }
  } catch (err) {
    logger.warn({ err }, "[expo-push] send failed");
  }
}
