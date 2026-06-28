import type { NextFunction, Request, RequestHandler, Response } from "express";
import { assertPassengerCanBook } from "../lib/customerCancellationSuspensionPolicy";
import { isPassengerAccountDeleted } from "../db/passengerProfileDeletionData";
import { isSessionJwtConfigured, type SessionClaims, verifySessionJwt } from "../lib/sessionJwt";

function bearerToken(req: Request): string | null {
  const raw = req.get("authorization")?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

export type CustomerSessionRequest = Request & { customerSession?: SessionClaims };

async function verifyCustomerBearerSession(
  req: Request,
  res: Response,
): Promise<SessionClaims | null> {
  if (!isSessionJwtConfigured()) {
    res.status(503).json({ error: "session_jwt_unconfigured", ok: false });
    return null;
  }
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized", ok: false, hint: "Send Authorization: Bearer <session_jwt>." });
    return null;
  }
  try {
    return await verifySessionJwt(token);
  } catch {
    res.status(401).json({ error: "invalid_token", ok: false });
    return null;
  }
}

/** Session-JWT prüfen — ohne deleted_at-Check (z. B. idempotente Konto-Löschung). */
export const requireCustomerSessionJwtOnly: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const claims = await verifyCustomerBearerSession(req, res);
  if (!claims) return;
  (req as CustomerSessionRequest).customerSession = claims;
  next();
};

export const requireCustomerSession: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const claims = await verifyCustomerBearerSession(req, res);
  if (!claims) return;
  const passengerId = customerPassengerId(claims);
  if (await isPassengerAccountDeleted(passengerId)) {
    res.status(403).json({
      ok: false,
      error: "account_deleted",
      message: "Dieses Konto wurde gelöscht.",
    });
    return;
  }
  (req as CustomerSessionRequest).customerSession = claims;
  next();
};

export function customerPassengerId(claims: SessionClaims): string {
  return claims.googleId.trim();
}

/** Buchungs-Sperre nach zu vielen Stornos — Storno-Routen ausnehmen. */
export const rejectSuspendedCustomerBooking: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const sess = (req as CustomerSessionRequest).customerSession;
  if (!sess) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const gate = await assertPassengerCanBook(customerPassengerId(sess));
  if (!gate.ok) {
    res.status(403).json({ ok: false, error: gate.error, message: gate.message });
    return;
  }
  next();
};
