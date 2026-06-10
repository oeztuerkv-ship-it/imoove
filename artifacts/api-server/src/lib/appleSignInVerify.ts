import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type VerifiedAppleIdentity = {
  sub: string;
  email: string | null;
};

function appleClientIds(): string[] {
  const raw = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.EXPO_PUBLIC_APPLE_BUNDLE_ID,
    "com.vedat.mobile",
  ];
  const out = new Set<string>();
  for (const v of raw) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) out.add(t);
  }
  return [...out];
}

/** Native Sign in with Apple: Identity-Token (JWT) gegen Apple JWKS prüfen. */
export async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedAppleIdentity> {
  const token = identityToken.trim();
  if (!token) throw new Error("identity_token_required");

  const audiences = appleClientIds();
  if (audiences.length === 0) {
    throw new Error("apple_client_id_not_configured");
  }

  const { payload } = await jwtVerify(token, APPLE_JWKS, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) throw new Error("apple_token_missing_sub");

  const email = typeof payload.email === "string" && payload.email.trim() ? payload.email.trim() : null;
  return { sub, email };
}

/** Stabile Kunden-ID (`passenger_id` / Session-JWT `sub`), getrennt von Google-IDs. */
export function applePassengerSubject(appleSub: string): string {
  const s = appleSub.trim();
  if (!s) return "";
  return s.startsWith("apple:") ? s : `apple:${s}`;
}
