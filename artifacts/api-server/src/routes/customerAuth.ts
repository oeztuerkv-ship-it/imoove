import { Router, type Request } from "express";
import {
  confirmCustomerPasswordReset,
  loginCustomerAccount,
  registerCustomerAccount,
} from "../lib/customerAuthFlow";
import {
  acceptCustomerLegalConsent,
  fetchLegalConsentVersions,
  getCustomerLegalConsentStatus,
} from "../lib/customerLegalConsent";
import {
  customerPassengerId,
  requireCustomerSession,
  type CustomerSessionRequest,
} from "../middleware/requireCustomerSession";
import { isPostgresConfigured } from "../db/client";

const router = Router();

function forwardedIp(req: Request): string {
  const xf = req.get("x-forwarded-for");
  const head = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  if (head) return head;
  return typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : "";
}

router.post("/auth/customer/register", async (req, res) => {
  const outcome = await registerCustomerAccount({
    bodyEmail: req.body?.email,
    bodyProofToken: req.body?.proofToken ?? req.body?.proof_token,
    bodyName: req.body?.name,
    bodyPassword: req.body?.password,
    bodyPasswordConfirm: req.body?.passwordConfirm ?? req.body?.password_confirm,
    bodyAcceptLegal: req.body?.acceptLegal ?? req.body?.accept_legal,
  });
  if (!outcome.ok) {
    res.status(outcome.status).json({ ok: false, error: outcome.error });
    return;
  }
  res.json({ ok: true, sessionToken: outcome.sessionToken, customer: outcome.customer });
});

router.post("/auth/customer/login", async (req, res) => {
  const outcome = await loginCustomerAccount({
    bodyEmail: req.body?.email,
    bodyPassword: req.body?.password,
    ip: forwardedIp(req),
  });
  if (!outcome.ok) {
    if (typeof outcome.retryAfterSec === "number") {
      res.setHeader("Retry-After", String(outcome.retryAfterSec));
    }
    res.status(outcome.status).json({
      ok: false,
      error: outcome.error,
      ...(typeof outcome.retryAfterSec === "number" ? { retryAfterSeconds: outcome.retryAfterSec } : {}),
    });
    return;
  }
  res.json({ ok: true, sessionToken: outcome.sessionToken, customer: outcome.customer });
});

router.post("/auth/customer/password-reset/confirm", async (req, res) => {
  const outcome = await confirmCustomerPasswordReset({
    bodyEmail: req.body?.email,
    bodyProofToken: req.body?.proofToken ?? req.body?.proof_token,
    bodyPassword: req.body?.password,
    bodyPasswordConfirm: req.body?.passwordConfirm ?? req.body?.password_confirm,
  });
  if (!outcome.ok) {
    res.status(outcome.status).json({ ok: false, error: outcome.error });
    return;
  }
  res.json({ ok: true });
});

router.get("/auth/customer/legal-versions", async (_req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ ok: false, error: "database_not_configured" });
    return;
  }
  const outcome = await fetchLegalConsentVersions();
  if (!outcome.ok) {
    res.status(503).json({ ok: false, error: outcome.error });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ok: true, versions: outcome.versions });
});

router.get("/auth/customer/legal-status", requireCustomerSession, async (req, res) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const status = await getCustomerLegalConsentStatus(customerPassengerId(sess));
    res.json({ ok: true, status });
  } catch {
    res.status(500).json({ ok: false, error: "legal_status_failed" });
  }
});

router.post("/auth/customer/legal-acceptance", requireCustomerSession, async (req, res) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const acceptLegal = req.body?.acceptLegal ?? req.body?.accept_legal;
    const outcome = await acceptCustomerLegalConsent({
      passengerId: customerPassengerId(sess),
      acceptLegal: acceptLegal === true,
    });
    if (!outcome.ok) {
      res.status(outcome.status).json({ ok: false, error: outcome.error });
      return;
    }
    res.json({ ok: true, status: outcome.status });
  } catch {
    res.status(500).json({ ok: false, error: "legal_acceptance_failed" });
  }
});

export default router;
