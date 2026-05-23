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
  if (k === "database_error") {
    return "Server-Datenbank vorübergehend nicht erreichbar — bitte später erneut.";
  }
  if (k === "rate_limit_email" || k === "rate_limit_ip" || k === "rate_limit_resend") {
    return "Zu viele Anfragen — bitte kurz warten und erneut versuchen.";
  }
  if (k === "invalid_code") return "Der Code ist ungültig.";
  if (k === "code_expired") return "Der Code ist abgelaufen. Bitte einen neuen anfordern.";
  if (k === "too_many_attempts") return "Zu viele Fehlversuche. Bitte einen neuen Code anfordern.";
  if (k === "account_exists") {
    return "Bereits registriert — bitte einloggen. Diese E-Mail-Adresse hat schon ein Konto.";
  }
  return "Es ist ein Fehler aufgetreten.";
}

/** 409 vom Server bei bereits registrierter E-Mail (customer_accounts). */
export function isEmailStartAccountExistsResponse(
  status: number,
  errorCode: unknown,
): boolean {
  return status === 409 && (errorCode === "account_exists" || errorCode === undefined);
}
