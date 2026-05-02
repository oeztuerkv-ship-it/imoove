import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { FleetDriverJwtClaims } from "../lib/fleetDriverJwt";
import { verifyFleetDriverJwt } from "../lib/fleetDriverJwt";
import { findFleetDriverAuthRow } from "../db/fleetDriversData";

export type FleetDriverAuthRequest = Request & { fleetDriverAuth?: FleetDriverJwtClaims };

function bearerToken(req: Request): string | null {
  const raw = req.get("authorization")?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

/**
 * Fleet-Fahrer-Session: JWT + `session_version`. Deaktiviert / gesperrt (`is_active`, `access_status`) → 403 hier.
 */
export const requireFleetDriverAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "unauthorized",
      hint: "Send Authorization: Bearer <fleet_jwt> from POST /api/fleet-auth/login.",
    });
    return;
  }
  try {
    const claims = await verifyFleetDriverJwt(token);
    const row = await findFleetDriverAuthRow(claims.fleetDriverId);
    if (!row || row.company_id !== claims.companyId) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: "driver_account_inactive" });
      return;
    }
    if (row.access_status !== "active") {
      res.status(403).json({ error: "driver_access_suspended" });
      return;
    }
    if (row.session_version !== claims.sessionVersion) {
      res.status(401).json({ error: "token_revoked" });
      return;
    }
    (req as FleetDriverAuthRequest).fleetDriverAuth = claims;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
};
