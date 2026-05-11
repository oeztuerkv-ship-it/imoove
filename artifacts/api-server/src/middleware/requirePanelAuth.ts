import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PanelJwtClaims } from "../lib/panelJwt";
import { verifyPanelJwt } from "../lib/panelJwt";

export type PanelAuthRequest = Request & { panelAuth?: PanelJwtClaims };

function bearerToken(req: Request): string | null {
  const raw = req.get("authorization")?.trim();
  if (!raw) {
    const qt = typeof req.query?.token === "string" ? req.query.token.trim() : "";
    return qt.length > 0 ? qt : null;
  }
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

/**
 * Liest `Authorization: Bearer`, verifiziert das Panel-Session-JWT und hängt Claims an `req.panelAuth`.
 */
export const requirePanelAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "unauthorized",
      hint: "Send Authorization: Bearer <panel_jwt> from POST /api/panel-auth/login.",
    });
    return;
  }
  try {
    const claims = await verifyPanelJwt(token);
    (req as PanelAuthRequest).panelAuth = claims;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
};
