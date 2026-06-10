import type { NextFunction, Request, RequestHandler, Response } from "express";
import { assertPassengerCanBook } from "../lib/customerCancellationSuspensionPolicy";
import { isSessionJwtConfigured, type SessionClaims, verifySessionJwt } from "../lib/sessionJwt";

function bearerToken(req: Request): string | null {
  const raw = req.get("authorization")?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

export type CustomerSessionRequest = Request & { customerSession?: SessionClaims };

export const requireCustomerSession: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!isSessionJwtConfigured()) {
    res.status(503).json({ error: "session_jwt_unconfigured", ok: false });
    return;
  }
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized", ok: false, hint: "Send Authorization: Bearer <session_jwt>." });
    return;
  }
  try {
    const claims = await verifySessionJwt(token);
    (req as CustomerSessionRequest).customerSession = claims;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token", ok: false });
  }
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
