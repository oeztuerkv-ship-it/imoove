import * as WebBrowser from "expo-web-browser";

import { getApiBaseUrl, parseApiJsonResponse } from "@/utils/apiBase";
import { fetchAuthWithRetry, mapAuthNetworkFailure } from "@/utils/authNetworkRetry";
import { getGoogleOAuthRedirectUri } from "@/utils/googleOAuthReturnUrl";
import { mapGoogleOAuthReturnError } from "@/utils/googleOAuthErrors";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";
import { readOAuthReturnParams } from "@/utils/readOAuthReturnParams";

export type CustomerGoogleSignInResult = {
  sessionToken: string;
  googleId: string;
  name: string;
  email: string;
  photoUri: string | null;
  authProvider: "google";
};

function normalizeApiUrl(apiUrl?: string | null): string {
  const base = (apiUrl ?? getApiBaseUrl()).trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("API-Adresse fehlt. Bitte EXPO_PUBLIC_API_URL setzen (https://api.onroda.de/api).");
  }
  return base;
}

async function fetchGoogleOAuthStart(
  apiUrl: string,
  returnUrl: string,
): Promise<{ authUrl: string; state: string }> {
  const startUrl = `${apiUrl}/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`;
  let res: Response;
  try {
    res = await fetchAuthWithRetry(
      startUrl,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
      { timeoutMs: 12_000, maxAttempts: 3 },
    );
  } catch (err) {
    throw new Error(mapAuthNetworkFailure(err, "Google-Anmeldung"));
  }
  if (res.status === 404) {
    throw new Error(
      `Login-Route nicht gefunden (404). Erwartet: ${startUrl} — EXPO_PUBLIC_API_URL muss auf …/api zeigen.`,
    );
  }
  return parseApiJsonResponse<{ authUrl: string; state: string }>(res, {
    fallbackLabel: "Google-Login",
    requiredKeys: ["authUrl"],
  });
}

function sessionFromToken(sessionToken: string): CustomerGoogleSignInResult {
  const p = parseJwtPayloadUnsafe(sessionToken);
  if (!p?.sub) {
    throw new Error("Ungültiges Session-Token von der API.");
  }
  return {
    sessionToken,
    googleId: String(p.sub),
    name: String(p.name ?? ""),
    email: String(p.email ?? ""),
    photoUri: typeof p.picture === "string" ? p.picture : null,
    authProvider: "google",
  };
}

/**
 * Google OAuth über Backend (Server-Flow) → Session-JWT in der App.
 * `null` wenn der Nutzer den Browser abbricht.
 */
export async function runCustomerGoogleSignIn(
  apiUrlInput?: string | null,
): Promise<CustomerGoogleSignInResult | null> {
  const apiUrl = normalizeApiUrl(apiUrlInput);
  const redirectUri = getGoogleOAuthRedirectUri();
  if (__DEV__) {
    console.log("[GoogleLogin] redirectUri=", redirectUri, "api=", apiUrl);
  }

  try {
    if (typeof WebBrowser.dismissAuthSession === "function") {
      await WebBrowser.dismissAuthSession();
    }
  } catch {
    /* ignore — stale AuthSession kann sonst hängen bleiben */
  }

  const { authUrl } = await fetchGoogleOAuthStart(apiUrl, redirectUri);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== "success") return null;
  if (!result.url?.trim()) {
    throw new Error("Keine Rückkehr-URL vom Browser erhalten.");
  }

  const { error, token, detail } = readOAuthReturnParams(result.url);
  if (error) {
    throw new Error(mapGoogleOAuthReturnError(error, detail));
  }
  const sessionToken = token?.trim();
  if (!sessionToken) {
    throw new Error("Kein Session-Token empfangen — Deep Link login-success prüfen.");
  }
  return sessionFromToken(sessionToken);
}
