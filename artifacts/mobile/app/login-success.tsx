import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import { useUser } from "@/context/UserContext";
import { gateCustomerOAuthSession } from "@/utils/completeCustomerOAuthSession";
import { mapGoogleOAuthReturnError } from "@/utils/googleOAuthErrors";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";
import {
  clearPendingOAuthSession,
  savePendingOAuthSession,
} from "@/utils/pendingOAuthSessionStorage";

/**
 * Deep-Link nach Google-OAuth: onroda://login-success?token=…
 * (und gleicher Pfad bei Expo Go / Dev Client über makeRedirectUri).
 * Legal-Consent-Gate wie bei Profil/Start — kein Login ohne Zustimmung.
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
    if (!p || typeof p.sub !== "string") {
      Alert.alert("Anmeldung fehlgeschlagen", "Ungültiges Session-Token von der API.");
      router.replace("/profile");
      return;
    }

    const oauthProfile = {
      name: String(p.name ?? ""),
      email: String(p.email ?? ""),
      photoUri: typeof p.picture === "string" ? p.picture : null,
      googleId: String(p.sub),
      authProvider: "google" as const,
    };

    void (async () => {
      const gate = await gateCustomerOAuthSession(token, oauthProfile);
      if (gate.kind === "error") {
        Alert.alert("Hinweis", gate.message);
        router.replace("/profile");
        return;
      }
      if (gate.kind === "needs_consent") {
        await savePendingOAuthSession(gate.session);
        router.replace("/profile?oauthLegal=1");
        return;
      }
      await loginWithGoogle({
        ...gate.session.profile,
        sessionToken: gate.session.sessionToken,
      });
      await clearPendingOAuthSession();
      router.replace("/");
    })();
  }, [rawToken, rawError, rawDetail, loginWithGoogle, router]);

  return null;
}
