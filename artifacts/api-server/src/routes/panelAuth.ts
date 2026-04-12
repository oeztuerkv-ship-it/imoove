import { Router, type IRouter } from "express";
import { findActivePanelUserByUsername } from "../db/panelAuthData";
import { isPostgresConfigured } from "../db/client";
import { rateLimitPanelLogin } from "../lib/panelLoginRateLimit";
import { isPanelRoleString } from "../lib/panelPermissions";
import { verifyPassword } from "../lib/password";
import { isPanelJwtConfigured, signPanelJwt, type PanelRole } from "../lib/panelJwt";

const router: IRouter = Router();

router.post("/panel-auth/login", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitPanelLogin(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }

  if (!isPostgresConfigured()) {
    res.status(503).json({
      error: "database_not_configured",
      hint: "Set DATABASE_URL and apply init-onroda.sql (table panel_users).",
    });
    return;
  }
  if (!isPanelJwtConfigured()) {
    res.status(503).json({
      error: "panel_jwt_not_configured",
      hint:
        process.env.NODE_ENV === "production"
          ? "Set PANEL_JWT_SECRET in the API environment (required in production for panel login)."
          : "Set PANEL_JWT_SECRET, or for local dev only AUTH_JWT_SECRET.",
    });
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res.status(400).json({ error: "username_and_password_required" });
    return;
  }

  const row = await findActivePanelUserByUsername(username);
  if (!row || !isPanelRoleString(row.role)) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  let token: string;
  try {
    token = await signPanelJwt({
      panelUserId: row.id,
      companyId: row.company_id,
      username: row.username,
      email: row.email,
      role: row.role as PanelRole,
    });
  } catch (e) {
    console.error("[panel-auth/login] signPanelJwt:", e);
    res.status(500).json({ error: "token_sign_failed" });
    return;
  }

  res.json({
    ok: true,
    token,
    user: {
      id: row.id,
      companyId: row.company_id,
      username: row.username,
      email: row.email,
      role: row.role,
    },
  });
});

/**
 * Stateless JWT: Server speichert keine Session. Client verwirft das Token.
 */
router.post("/panel-auth/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;
