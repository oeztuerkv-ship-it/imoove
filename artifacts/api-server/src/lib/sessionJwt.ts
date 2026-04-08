import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface SessionClaims {
  googleId: string;
  email: string;
  name: string;
  photoUri: string | null;
}

function getSecretKey(): Uint8Array {
  const raw = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!raw) {
    throw new Error("AUTH_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(raw);
}

function issuer(): string {
  return (process.env.AUTH_JWT_ISSUER ?? "onroda-api").trim() || "onroda-api";
}

/** Session-JWT nach Google-OAuth (HS256). Claims: sub=googleId, email, name, picture (= photo URL). */
export async function signSessionJwt(claims: SessionClaims, expiresIn = "7d"): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({
    email: claims.email,
    name: claims.name,
    picture: claims.photoUri,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.googleId)
    .setIssuedAt()
    .setIssuer(issuer())
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifySessionJwt(token: string): Promise<SessionClaims> {
  const secret = getSecretKey();
  const { payload } = await jwtVerify(token, secret, {
    issuer: issuer(),
    algorithms: ["HS256"],
  });
  return jwtPayloadToClaims(payload);
}

export function jwtPayloadToClaims(payload: JWTPayload): SessionClaims {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new Error("invalid token: missing sub");
  }
  const pic = payload.picture;
  return {
    googleId: sub,
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    photoUri: typeof pic === "string" ? pic : null,
  };
}

export function isSessionJwtConfigured(): boolean {
  return Boolean((process.env.AUTH_JWT_SECRET ?? "").trim());
}
