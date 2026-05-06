import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const RECEIPT_LINK_KIND = "ride_receipt_html";
const RECEIPT_LINK_ISS = "onroda-receipt-link";

function secretKey(): Uint8Array {
  const raw = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!raw) throw new Error("AUTH_JWT_SECRET is not configured");
  return new TextEncoder().encode(raw);
}

/** Kurzlebiger Link zur HTML-Quittung (Externer Browser ohne Authorization-Header). */
export async function signReceiptHtmlAccessJwt(
  rideId: string,
  passengerGoogleId: string,
  expiresIn: string = "15m",
): Promise<string> {
  const gid = passengerGoogleId.trim();
  const rid = rideId.trim();
  if (!gid || !rid) throw new Error("receipt_access_jwt_missing_ids");
  return new SignJWT({ k: RECEIPT_LINK_KIND, rid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(gid)
    .setIssuer(RECEIPT_LINK_ISS)
    .setAudience("ride-receipt")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export type ReceiptHtmlAccessClaims = {
  passengerGoogleId: string;
  rideId: string;
};

export async function verifyReceiptHtmlAccessJwt(token: string): Promise<ReceiptHtmlAccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: RECEIPT_LINK_ISS,
    audience: "ride-receipt",
    algorithms: ["HS256"],
  });
  return payloadToClaims(payload);
}

function payloadToClaims(payload: JWTPayload): ReceiptHtmlAccessClaims {
  const k = typeof (payload as { k?: unknown }).k === "string" ? String((payload as { k?: string }).k) : "";
  if (k !== RECEIPT_LINK_KIND) throw new Error("invalid receipt token kind");
  const rid =
    typeof (payload as { rid?: unknown }).rid === "string" ? String((payload as { rid: string }).rid).trim() : "";
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!rid || !sub) throw new Error("invalid receipt token");
  return { rideId: rid, passengerGoogleId: sub };
}
