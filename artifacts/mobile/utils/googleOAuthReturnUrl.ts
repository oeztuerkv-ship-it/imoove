import * as AuthSession from "expo-auth-session";

/**
 * Rückkehr-URL nach Google-OAuth (Server hängt ?token=JWT an).
 * Muss zur Route `app/login-success` passen (Scheme z. B. onroda → onroda://login-success).
 */
export function getGoogleOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({ path: "login-success" });
}
