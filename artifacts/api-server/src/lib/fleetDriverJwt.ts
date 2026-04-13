import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface FleetDriverJwtClaims {
  fleetDriverId: string;
  companyId: string;
  email: string;
  sessionVersion: number;
}

function getSecretKey(): Uint8Array {
  const fleet = (process.env.FLEET_DRIVER_JWT_SECRET ?? "").trim();
  if (fleet) {
    return new TextEncoder().encode(fleet);
  }
  const panel = (process.env.PANEL_JWT_SECRET ?? "").trim();
  if (panel) {
    return new TextEncoder().encode(panel);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FLEET_DRIVER_JWT_SECRET or PANEL_JWT_SECRET is required for fleet driver tokens in production");
  }
  const auth = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!auth) {
    throw new Error("FLEET_DRIVER_JWT_SECRET, PANEL_JWT_SECRET, or AUTH_JWT_SECRET must be set");
  }
  return new TextEncoder().encode(auth);
}

function issuer(): string {
  return (process.env.FLEET_DRIVER_JWT_ISSUER ?? "onroda-fleet-driver").trim() || "onroda-fleet-driver";
}

export function isFleetDriverJwtConfigured(): boolean {
  if ((process.env.FLEET_DRIVER_JWT_SECRET ?? "").trim()) return true;
  if ((process.env.PANEL_JWT_SECRET ?? "").trim()) return true;
  if (process.env.NODE_ENV === "production") return false;
  return Boolean((process.env.AUTH_JWT_SECRET ?? "").trim());
}

export async function signFleetDriverJwt(
  claims: FleetDriverJwtClaims,
  expiresIn = "14d",
): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({
    kind: "fleet_driver",
    companyId: claims.companyId,
    email: claims.email,
    sv: claims.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.fleetDriverId)
    .setIssuedAt()
    .setIssuer(issuer())
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyFleetDriverJwt(token: string): Promise<FleetDriverJwtClaims> {
  const secret = getSecretKey();
  const { payload } = await jwtVerify(token, secret, {
    issuer: issuer(),
    algorithms: ["HS256"],
  });
  return payloadToFleetDriverClaims(payload);
}

export function payloadToFleetDriverClaims(payload: JWTPayload): FleetDriverJwtClaims {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("invalid fleet driver token: missing sub");
  if (payload.kind !== "fleet_driver") throw new Error("invalid fleet driver token: wrong kind");
  const companyId = typeof payload.companyId === "string" ? payload.companyId : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const sv = typeof payload.sv === "number" ? payload.sv : Number(payload.sv);
  if (!companyId || !email || !Number.isFinite(sv)) {
    throw new Error("invalid fleet driver token: missing claims");
  }
  return { fleetDriverId: sub, companyId, email, sessionVersion: Math.floor(sv) };
}
