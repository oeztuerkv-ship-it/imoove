/** Verzögerungen nach fehlgeschlagenem Capture: 1 h → 24 h → 72 h (danach Sperre). */
export const PAYMENT_CAPTURE_RETRY_DELAYS_MS = [
  60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
] as const;

/** Initial + 3 Cron-Retries. */
export const PAYMENT_CAPTURE_MAX_ATTEMPTS = PAYMENT_CAPTURE_RETRY_DELAYS_MS.length + 1;

export function paymentCaptureRetryDelayMs(attemptCountAfterFailure: number): number | null {
  const idx = attemptCountAfterFailure - 1;
  if (idx < 0 || idx >= PAYMENT_CAPTURE_RETRY_DELAYS_MS.length) return null;
  return PAYMENT_CAPTURE_RETRY_DELAYS_MS[idx] ?? null;
}

export const CUSTOMER_PAYMENT_SUSPENSION_ERROR = "customer_payment_suspended";
export const CUSTOMER_PAYMENT_SUSPENSION_MESSAGE_DE =
  "Eine Zahlung ist offen. Bitte aktualisieren Sie Ihre Zahlungsmethode in der Geldbörse oder begleichen Sie die offene Fahrt, bevor Sie erneut buchen.";
