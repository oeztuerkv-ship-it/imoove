import type { RequestHandler } from "express";

/**
 * Schützt `/admin/*`-JSON-Endpunkte: `Authorization: Bearer <ADMIN_API_BEARER_TOKEN>`.
 * Ohne gesetztes Secret: in Produktion 503, in Entwicklung weiter (lokales Arbeiten).
 */
export const requireAdminApiBearer: RequestHandler = (req, res, next) => {
  const token = (process.env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({
        error: "admin_api_auth_not_configured",
        hint: "Set ADMIN_API_BEARER_TOKEN in the API environment for /admin/* routes.",
      });
      return;
    }
    next();
    return;
  }
  const auth = req.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (auth !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};
