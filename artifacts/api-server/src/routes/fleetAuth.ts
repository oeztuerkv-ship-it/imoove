import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import { findFleetDriverByEmailNormalized, getCompanyKind, touchFleetDriverLogin } from "../db/fleetDriversData";
import { getFleetLoginCompanyDenyReason } from "../db/companyGovernanceData";
import { isFleetDriverJwtConfigured, signFleetDriverJwt } from "../lib/fleetDriverJwt";
import { rateLimitFleetLogin } from "../lib/fleetLoginRateLimit";
import { verifyPassword } from "../lib/password";

const router: IRouter = Router();

router.post("/fleet-auth/login", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitFleetLogin(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }

  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  if (!isFleetDriverJwtConfigured()) {
    res.status(503).json({
      error: "fleet_jwt_not_configured",
      hint: "Set FLEET_DRIVER_JWT_SECRET or PANEL_JWT_SECRET (or AUTH_JWT_SECRET in non-production).",
    });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "email_and_password_required" });
    return;
  }

  const row = await findFleetDriverByEmailNormalized(email);
  if (!row) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const kind = await getCompanyKind(row.company_id);
  if (kind !== "taxi") {
    res.status(403).json({ error: "fleet_login_only_taxi_company" });
    return;
  }
  const deny = await getFleetLoginCompanyDenyReason(row.company_id);
  if (deny) {
    res.status(403).json({ error: deny });
    return;
  }

  if (!row.is_active) {
    res.status(403).json({ error: "driver_account_inactive" });
    return;
  }

  if (String(row.access_status ?? "").toLowerCase() !== "active") {
    res.status(403).json({ error: "driver_access_suspended" });
    return;
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  let token: string;
  try {
    token = await signFleetDriverJwt({
      fleetDriverId: row.id,
      companyId: row.company_id,
      email: row.email,
      sessionVersion: row.session_version,
    });
  } catch (e) {
    console.error("[fleet-auth/login] signFleetDriverJwt:", e);
    res.status(500).json({ error: "token_sign_failed" });
    return;
  }

  await touchFleetDriverLogin(row.id);

  res.json({
    ok: true,
    token,
    passwordChangeRequired: row.must_change_password,
    driver: {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      mustChangePassword: row.must_change_password,
    },
  });
});

router.post("/fleet-auth/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;
