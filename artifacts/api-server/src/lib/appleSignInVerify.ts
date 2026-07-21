import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
/** Timeout für JWKS-Fetch — ohne Limit hängt verifyAppleIdentityToken bei Netzproblemen. */
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  timeoutDuration: 8_000,
  cooldownDuration: 30_000,
});

export type VerifiedAppleIdentity = {
  sub: string;
  email: string | null;
  aud: string | string[] | undefined;
};

/**
 * Erlaubte JWT-Audiences für Sign in with Apple.
 * - Native iOS / TestFlight / Production: Bundle-ID (app.json → com.vedat.mobile)
 * - Expo Go: host.exp.Exponent
 * - Optional Web/Services-ID: APPLE_CLIENT_ID oder APPLE_ALLOWED_AUDIENCES (Komma-getrennt)
 *
 * Native und Web dürfen NICHT dieselbe Audience haben — Apple setzt bei Native immer die Bundle-ID.
 */
export function appleAllowedAudiences(): string[] {
  const raw: Array<string | undefined> = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.EXPO_PUBLIC_APPLE_BUNDLE_ID,
    process.env.APPLE_ALLOWED_AUDIENCES,
    // Production / TestFlight Bundle-ID (kanonisch)
    "com.vedat.mobile",
    // Expo Go
    "host.exp.Exponent",
  ];
  const out = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string" || !v.trim()) continue;
    for (const part of v.split(",")) {
      const t = part.trim();
      if (t) out.add(t);
    }
  }
  return [...out];
}

export function peekAppleTokenAudience(identityToken: string): string | string[] | null {
  try {
    const payload = decodeJwt(identityToken.trim());
    const aud = payload.aud;
    if (typeof aud === "string") return aud;
    if (Array.isArray(aud)) return aud.map(String);
    return null;
  } catch {
    return null;
  }
}

/** Native Sign in with Apple: Identity-Token (JWT) gegen Apple JWKS prüfen. */
export async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedAppleIdentity> {
  const token = identityToken.trim();
  if (!token) throw new Error("identity_token_required");

  const audiences = appleAllowedAudiences();
  if (audiences.length === 0) {
    throw new Error("apple_client_id_not_configured");
  }

  const peekedAud = peekAppleTokenAudience(token);

  try {
    const { payload } = await jwtVerify(token, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub) throw new Error("apple_token_missing_sub");

    const email = typeof payload.email === "string" && payload.email.trim() ? payload.email.trim() : null;
    return { sub, email, aud: payload.aud };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/aud/i.test(msg) || /audience/i.test(msg)) {
      const received = peekedAud == null ? "(unlesbar)" : JSON.stringify(peekedAud);
      const expected = audiences.join(", ");
      const detailed = new Error(
        `unexpected_aud: received=${received}; expected=[${expected}]`,
      );
      detailed.name = "AppleAudMismatch";
      throw detailed;
    }
    throw err;
  }
}

/** Stabile Kunden-ID (`passenger_id` / Session-JWT `sub`), getrennt von Google-IDs. */
export function applePassengerSubject(appleSub: string): string {
  const s = appleSub.trim();
  if (!s) return "";
  return s.startsWith("apple:") ? s : `apple:${s}`;
}
