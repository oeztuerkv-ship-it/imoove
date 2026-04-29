import { SignJWT, jwtVerify } from "jose";
import { isSessionJwtConfigured } from "./sessionJwt";

function secret(): Uint8Array | null {
  const raw = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

function issuer(): string {
  return (process.env.AUTH_JWT_ISSUER ?? "onroda-api").trim() || "onroda-api";
}

/** Kurzlebiger Nachweis, dass die E-Mail per Code bestätigt wurde (Optional für spätere Backend-Flows). */
export async function signEmailVerificationProofJwt(
  email: string,
  purpose: string,
  expiresIn = "24h",
): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  return new SignJWT({ verification_kind: "onroda_email", purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setIssuer(issuer())
    .setExpirationTime(expiresIn)
    .sign(s);
}

/** Optional: spätere APIs können den Nachweis prüfen. */
export async function verifyEmailVerificationProofJwt(token: string): Promise<{
  email: string;
  purpose: string;
} | null> {
  if (!isSessionJwtConfigured()) return null;
  const s = secret();
  if (!s) return null;
  try {
    const { payload } = await jwtVerify(token, s, {
      issuer: issuer(),
      algorithms: ["HS256"],
    });
    const kind = (payload as Record<string, unknown>).verification_kind;
    if (kind !== "onroda_email" || typeof payload.sub !== "string") return null;
    const purpose = typeof payload.purpose === "string" ? payload.purpose : "";
    if (!purpose) return null;
    return { email: payload.sub, purpose };
  } catch {
    return null;
  }
}
