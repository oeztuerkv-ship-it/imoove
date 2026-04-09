import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useUser } from "@/context/UserContext";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";

/**
 * Deep-Link nach Google-OAuth: onroda://login-success?token=…
 * (und gleicher Pfad bei Expo Go / Dev Client über makeRedirectUri).
 */
export default function LoginSuccessScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string | string[] }>();
  const raw = typeof tokenParam === "string" ? tokenParam : tokenParam?.[0];
  const { loginWithGoogle } = useUser();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!raw?.trim()) {
      router.replace("/profile");
      return;
    }
    handled.current = true;
    const p = parseJwtPayloadUnsafe(raw);
    if (p && typeof p.sub === "string") {
      loginWithGoogle({
        name: String(p.name ?? ""),
        email: String(p.email ?? ""),
        photoUri: typeof p.picture === "string" ? p.picture : null,
        googleId: String(p.sub),
        sessionToken: raw,
      });
    }
    router.replace("/");
  }, [raw, loginWithGoogle, router]);

  return null;
}
