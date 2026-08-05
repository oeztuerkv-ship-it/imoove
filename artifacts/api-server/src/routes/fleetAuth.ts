import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import { deleteFleetDriverExpoPushTokens } from "../db/fleetDriverExpoPushData";
import {
  createFleetDriverPasswordResetToken,
  findOpenFleetDriverPasswordResetByHash,
  markFleetDriverPasswordResetUsed,
} from "../db/fleetDriverPasswordResetData";
import {
  findFleetDriverByEmailNormalized,
  getCompanyKind,
  setFleetDriverMarketOnline,
  touchFleetDriverLogin,
  updateFleetDriverPassword,
} from "../db/fleetDriversData";
import { findActivePanelUserByEmailNormalized } from "../db/panelAuthData";
import {
  getFleetLoginCompanyDenyReason,
  type FleetLoginCompanyDenyReason,
} from "../db/companyGovernanceData";
import {
  FLEET_LOGIN_COMPANY_NOT_READY_MESSAGE_DE,
  PANEL_EMAIL_NOT_FLEET_DRIVER_MESSAGE_DE,
} from "../lib/onrodaAccessMessages.js";
import {
  fleetPasswordResetCodesEqual,
  fleetPasswordResetTtlMs,
  generateFleetPasswordResetCode,
  hashFleetPasswordResetCode,
  sendFleetDriverPasswordResetMail,
} from "../lib/fleetDriverPasswordResetMail";
import {
  isFleetDriverJwtConfigured,
  signFleetDriverJwt,
  verifyFleetDriverJwt,
} from "../lib/fleetDriverJwt";
import { rateLimitFleetLogin } from "../lib/fleetLoginRateLimit";
import { logger } from "../lib/logger";
import { hashPassword, verifyPassword } from "../lib/password";
import { isPanelEmailAllowedForFleetDriver } from "../lib/fleetPanelEmailAllowlist";

const router: IRouter = Router();

const FLEET_PASSWORD_RESET_REQUEST_GENERIC = {
  ok: true as const,
  message:
    "Wenn ein aktiver Fahrer-Zugang zu dieser E-Mail existiert, erhältst du in Kürze eine E-Mail mit einem Code zum Zurücksetzen.",
};

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

  const panelAccount = await findActivePanelUserByEmailNormalized(email);
  if (panelAccount && !isPanelEmailAllowedForFleetDriver(email)) {
    res.status(403).json({
      error: "panel_email_not_fleet_driver",
      message: PANEL_EMAIL_NOT_FLEET_DRIVER_MESSAGE_DE,
    });
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
    const companyDeny = new Set<FleetLoginCompanyDenyReason>([
      "company_inactive",
      "company_blocked",
      "contract_not_active",
    ]);
    res.status(403).json({
      error: deny,
      ...(companyDeny.has(deny) ? { message: FLEET_LOGIN_COMPANY_NOT_READY_MESSAGE_DE } : {}),
    });
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

  // Alte Geräte: JWT tot + kein Push + Markt nicht „online ohne Session“.
  await deleteFleetDriverExpoPushTokens(row.id, row.company_id);
  await setFleetDriverMarketOnline(row.id, row.company_id, false).catch(() => undefined);
  const sessionVersion = await touchFleetDriverLogin(row.id);

  let token: string;
  try {
    token = await signFleetDriverJwt({
      fleetDriverId: row.id,
      companyId: row.company_id,
      email: row.email,
      sessionVersion,
    });
  } catch (e) {
    console.error("[fleet-auth/login] signFleetDriverJwt:", e);
    res.status(500).json({ error: "token_sign_failed" });
    return;
  }

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

router.post("/fleet-auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization?.trim() ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (bearer && isPostgresConfigured()) {
    try {
      const claims = await verifyFleetDriverJwt(bearer);
      if (claims?.fleetDriverId && claims?.companyId) {
        await setFleetDriverMarketOnline(claims.fleetDriverId, claims.companyId, false);
        await deleteFleetDriverExpoPushTokens(claims.fleetDriverId, claims.companyId);
      }
    } catch {
      /* abgelaufenes Token — trotzdem ok */
    }
  }
  res.json({ ok: true });
});

/**
 * Passwort vergessen (Fahrer-App): 6-stelliger Code per E-Mail.
 * Antwort immer neutral (kein User-Leak), außer Rate-Limit / DB down.
 */
router.post("/fleet-auth/password-reset/request", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitFleetLogin(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "email_required" });
    return;
  }
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  if (!isFleetDriverJwtConfigured()) {
    res.status(503).json({
      error: "fleet_jwt_not_configured",
      hint: "Set FLEET_DRIVER_JWT_SECRET or PANEL_JWT_SECRET (needed to hash reset codes).",
    });
    return;
  }

  const row = await findFleetDriverByEmailNormalized(email);
  if (
    !row ||
    !row.is_active ||
    String(row.access_status ?? "").toLowerCase() !== "active"
  ) {
    res.json(FLEET_PASSWORD_RESET_REQUEST_GENERIC);
    return;
  }

  const code = generateFleetPasswordResetCode();
  const tokenHash = hashFleetPasswordResetCode(email, code);
  const expiresAt = new Date(Date.now() + fleetPasswordResetTtlMs());
  const created = await createFleetDriverPasswordResetToken({
    fleetDriverId: row.id,
    companyId: row.company_id,
    tokenHash,
    expiresAt,
  });
  if (!created) {
    logger.warn(
      { event: "fleet.auth.password_reset_request.store_failed", fleetDriverId: row.id },
      "fleet password reset token store failed",
    );
    res.json(FLEET_PASSWORD_RESET_REQUEST_GENERIC);
    return;
  }

  const mailResult = await sendFleetDriverPasswordResetMail({
    to: row.email,
    code,
    expiresAt,
  });
  logger.info(
    {
      event: "fleet.auth.password_reset_requested",
      fleetDriverId: row.id,
      companyId: row.company_id,
      mailSent: mailResult.ok,
      ...(mailResult.ok ? {} : { mailFailureReason: mailResult.reason }),
    },
    "fleet password reset requested",
  );

  if (!mailResult.ok) {
    res.status(503).json({
      ok: false,
      error: "mail_send_failed",
      reason: mailResult.reason,
      message:
        mailResult.reason === "smtp_not_configured"
          ? "E-Mail-Versand ist auf dem Server nicht konfiguriert. Bitte den Betrieb oder Support kontaktieren."
          : "Die E-Mail konnte nicht versendet werden. Bitte später erneut versuchen.",
    });
    return;
  }

  res.json(FLEET_PASSWORD_RESET_REQUEST_GENERIC);
});

router.post("/fleet-auth/password-reset/confirm", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitFleetLogin(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const codeRaw = typeof req.body?.code === "string" ? req.body.code : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const code = codeRaw.replace(/\D/g, "").slice(0, 6);

  if (!email || !email.includes("@") || code.length !== 6 || newPassword.length < 10) {
    res.status(400).json({
      error: "reset_payload_invalid",
      hint: "email + code(6 digits) + newPassword(min10)",
    });
    return;
  }
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }

  const tokenHash = hashFleetPasswordResetCode(email, code);
  const reset = await findOpenFleetDriverPasswordResetByHash(tokenHash);
  if (!reset) {
    res.status(400).json({ error: "invalid_or_expired_reset_code" });
    return;
  }

  const row = await findFleetDriverByEmailNormalized(email);
  if (
    !row ||
    row.id !== reset.fleetDriverId ||
    row.company_id !== reset.companyId ||
    !row.is_active ||
    String(row.access_status ?? "").toLowerCase() !== "active"
  ) {
    res.status(400).json({ error: "invalid_or_expired_reset_code" });
    return;
  }

  // Timing-safe Vergleich der gespeicherten Hashes (bereits über Lookup gefunden).
  if (!fleetPasswordResetCodesEqual(reset.tokenHash, tokenHash)) {
    res.status(400).json({ error: "invalid_or_expired_reset_code" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await updateFleetDriverPassword(row.id, row.company_id, passwordHash, false);
  const marked = await markFleetDriverPasswordResetUsed(reset.id);
  if (!updated || !marked) {
    res.status(500).json({ error: "password_update_failed" });
    return;
  }

  await deleteFleetDriverExpoPushTokens(row.id, row.company_id);
  await setFleetDriverMarketOnline(row.id, row.company_id, false).catch(() => undefined);

  logger.info(
    {
      event: "fleet.auth.password_reset_completed",
      fleetDriverId: row.id,
      companyId: row.company_id,
      resetId: reset.id,
    },
    "fleet password reset completed",
  );

  res.json({ ok: true });
});

export default router;
