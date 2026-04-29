export const EMAIL_VERIFICATION_PURPOSE = "customer_registration";

export function mapEmailVerificationApiError(code: unknown): string {
  const k = typeof code === "string" ? code : "";
  if (k === "invalid_email") return "Bitte gültige E-Mail-Adresse eingeben.";
  if (k === "invalid_params") return "Bitte E-Mail und 6-stelligen Code angeben.";
  if (k === "smtp_not_configured" || k === "email_send_failed") {
    return "E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.";
  }
  if (k === "database_not_configured" || k === "email_verification_not_configured") {
    return "Server noch nicht bereit für E-Mail-Bestätigung.";
  }
  if (k === "rate_limit_email" || k === "rate_limit_ip" || k === "rate_limit_resend") {
    return "Zu viele Anfragen — bitte kurz warten und erneut versuchen.";
  }
  if (k === "invalid_code") return "Der Code ist ungültig.";
  if (k === "code_expired") return "Der Code ist abgelaufen. Bitte einen neuen anfordern.";
  if (k === "too_many_attempts") return "Zu viele Fehlversuche. Bitte einen neuen Code anfordern.";
  return "Es ist ein Fehler aufgetreten.";
}
