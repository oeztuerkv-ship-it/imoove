/** Lesbare Fehlermeldungen aus OAuth-Rückkehr (?error= / ?detail=). */
export function mapGoogleOAuthReturnError(error: string | null, detail: string | null): string {
  const code = (error ?? "").trim();
  const d = (detail ?? "").trim();
  switch (code) {
    case "access_denied":
      return "Google-Anmeldung abgebrochen.";
    case "invalid_state":
      return "Anmeldung abgelaufen — bitte erneut versuchen.";
    case "missing_params":
      return "Google-Rückruf unvollständig — bitte erneut versuchen.";
    case "profile_fetch_failed":
      return "Google-Profil konnte nicht geladen werden.";
    case "session_token_failed":
      return "Server konnte keine Sitzung anlegen (AUTH_JWT_SECRET prüfen).";
    case "token_exchange_failed": {
      const lower = d.toLowerCase();
      if (lower.includes("redirect_uri_mismatch")) {
        return "Google-Redirect stimmt nicht — auf dem Server OAUTH_PUBLIC_ORIGIN und in der Google Console prüfen.";
      }
      if (lower.includes("invalid_client")) {
        return "Google Client ID / Secret auf dem Server prüfen.";
      }
      return d ? `Google-Token-Austausch fehlgeschlagen: ${d.slice(0, 160)}` : "Google-Token-Austausch fehlgeschlagen.";
    }
    case "server_error":
      return "Serverfehler bei der Google-Anmeldung — bitte später erneut versuchen.";
    default:
      if (code && d) return `Google-Fehler (${code}): ${d.slice(0, 160)}`;
      if (code) return `Google-Fehler: ${code}`;
      return "Google-Anmeldung fehlgeschlagen.";
  }
}
