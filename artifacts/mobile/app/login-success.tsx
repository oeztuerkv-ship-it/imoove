import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import { useUser } from "@/context/UserContext";
import { mapGoogleOAuthReturnError } from "@/utils/googleOAuthErrors";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";

/**
 * Deep-Link nach Google-OAuth: onroda://login-success?token=…
 * (und gleicher Pfad bei Expo Go / Dev Client über makeRedirectUri).
 */
export default function LoginSuccessScreen() {
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[]; detail?: string | string[] }>();
  const pick = (v?: string | string[]) => (typeof v === "string" ? v : v?.[0]);
  const rawToken = pick(params.token);
  const rawError = pick(params.error);
  const rawDetail = pick(params.detail);
  const { loginWithGoogle } = useUser();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (rawError?.trim()) {
      Alert.alert("Anmeldung fehlgeschlagen", mapGoogleOAuthReturnError(rawError, rawDetail ?? null));
      router.replace("/profile");
      return;
    }

    const token = rawToken?.trim();
    if (!token) {
      router.replace("/profile");
      return;
    }

    const p = parseJwtPayloadUnsafe(token);
    if (p && typeof p.sub === "string") {
      loginWithGoogle({
        name: String(p.name ?? ""),
        email: String(p.email ?? ""),
        photoUri: typeof p.picture === "string" ? p.picture : null,
        googleId: String(p.sub),
        sessionToken: token,
        authProvider: "google",
      });
      router.replace("/");
      return;
    }

    Alert.alert("Anmeldung fehlgeschlagen", "Ungültiges Session-Token von der API.");
    router.replace("/profile");
  }, [rawToken, rawError, rawDetail, loginWithGoogle, router]);

  return null;
}
