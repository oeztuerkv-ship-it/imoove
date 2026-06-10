import { Platform } from "react-native";

export type AppleSessionExchangeResult = {
  sessionToken: string;
  googleId: string;
  name: string;
  email: string;
  photoUri: null;
};

export async function isNativeAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const AppleAuthentication = await import("expo-apple-authentication");
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

async function exchangeAppleTokenWithApi(opts: {
  apiUrl: string;
  identityToken: string;
  fullName?: string | null;
  email?: string | null;
}): Promise<AppleSessionExchangeResult> {
  const base = opts.apiUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/auth/apple/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identityToken: opts.identityToken,
      ...(opts.fullName ? { fullName: opts.fullName } : {}),
      ...(opts.email ? { email: opts.email } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    profile?: { googleId?: string; name?: string; email?: string };
  };
  if (!res.ok || !data?.ok || !data.sessionToken?.trim()) {
    const code = data?.error ?? `http_${res.status}`;
    throw new Error(
      code === "invalid_apple_identity_token"
        ? "Apple-Anmeldung konnte nicht verifiziert werden."
        : code === "session_jwt_unconfigured"
          ? "Server: Session-JWT nicht konfiguriert (AUTH_JWT_SECRET)."
          : `Apple-Anmeldung fehlgeschlagen (${code}).`,
    );
  }
  const profile = data.profile ?? {};
  return {
    sessionToken: data.sessionToken.trim(),
    googleId: String(profile.googleId ?? "").trim(),
    name: String(profile.name ?? "").trim(),
    email: String(profile.email ?? "").trim(),
    photoUri: null,
  };
}

/** iOS: natives Apple-Login → API-Session-JWT. `null` wenn Nutzer abbricht. */
export async function runNativeAppleSignIn(apiUrl: string): Promise<AppleSessionExchangeResult | null> {
  if (!(await isNativeAppleSignInAvailable())) {
    throw new Error("Sign in with Apple ist auf diesem Gerät nicht verfügbar.");
  }
  const AppleAuthentication = await import("expo-apple-authentication");
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken?.trim()) {
    throw new Error("Kein Apple-Identity-Token erhalten.");
  }
  const fullName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ").trim()
    : "";
  return exchangeAppleTokenWithApi({
    apiUrl,
    identityToken: credential.identityToken,
    fullName: fullName || null,
    email: credential.email,
  });
}
