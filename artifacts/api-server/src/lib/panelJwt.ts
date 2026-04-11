import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type PanelRole = "owner" | "manager" | "staff";

export interface PanelJwtClaims {
  panelUserId: string;
  companyId: string;
  username: string;
  email: string;
  role: PanelRole;
}

function getSecretKey(): Uint8Array {
  const panel = (process.env.PANEL_JWT_SECRET ?? "").trim();
  if (panel) {
    return new TextEncoder().encode(panel);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("PANEL_JWT_SECRET is not configured (required in production for panel tokens)");
  }
  const auth = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!auth) {
    throw new Error("PANEL_JWT_SECRET or AUTH_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(auth);
}

function issuer(): string {
  return (process.env.PANEL_JWT_ISSUER ?? "onroda-panel").trim() || "onroda-panel";
}

export function isPanelJwtConfigured(): boolean {
  if ((process.env.PANEL_JWT_SECRET ?? "").trim()) {
    return true;
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return Boolean((process.env.AUTH_JWT_SECRET ?? "").trim());
}

/** Panel-Session (HS256), getrennt vom Google-OAuth-Session-JWT (anderer Issuer + Claims). */
export async function signPanelJwt(claims: PanelJwtClaims, expiresIn = "7d"): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({
    kind: "panel",
    companyId: claims.companyId,
    username: claims.username,
    email: claims.email,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.panelUserId)
    .setIssuedAt()
    .setIssuer(issuer())
    .setExpirationTime(expiresIn)
    .sign(secret);
}

function isPanelRole(v: unknown): v is PanelRole {
  return v === "owner" || v === "manager" || v === "staff";
}

export async function verifyPanelJwt(token: string): Promise<PanelJwtClaims> {
  const secret = getSecretKey();
  const { payload } = await jwtVerify(token, secret, {
    issuer: issuer(),
    algorithms: ["HS256"],
  });
  return payloadToPanelClaims(payload);
}

export function payloadToPanelClaims(payload: JWTPayload): PanelJwtClaims {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("invalid panel token: missing sub");
  if (payload.kind !== "panel") throw new Error("invalid panel token: wrong kind");
  const companyId = typeof payload.companyId === "string" ? payload.companyId : "";
  const username = typeof payload.username === "string" ? payload.username : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const role = payload.role;
  if (!companyId || !username || !isPanelRole(role)) {
    throw new Error("invalid panel token: missing claims");
  }
  return { panelUserId: sub, companyId, username, email, role };
}
