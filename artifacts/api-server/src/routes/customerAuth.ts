import { Router, type Request } from "express";
import { loginCustomerAccount, registerCustomerAccount } from "../lib/customerAuthFlow";

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
    bodyPhone: req.body?.phone,
    bodyPassword: req.body?.password,
    bodyPasswordConfirm: req.body?.passwordConfirm ?? req.body?.password_confirm,
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

export default router;
