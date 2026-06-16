import * as AuthSession from "expo-auth-session";

/**
 * Rückkehr-URL nach Google-OAuth (Server hängt ?token=JWT an).
 * Production: onroda://login-success — Expo Go: exp://…/--/login-success
 */
export function getGoogleOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: "onroda",
    path: "login-success",
    preferLocalhost: false,
  });
}
