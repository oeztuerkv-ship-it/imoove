import { Router, type Request } from "express";
import { dispatchEmailVerificationCode, verifyEmailCode } from "../lib/emailVerificationFlow";

const router = Router();

function forwardedIp(req: Request): string {
  const xf = req.get("x-forwarded-for");
  const head = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  if (head) return head;
  return typeof req.socket?.remoteAddress === "string" ? req.socket.remoteAddress : "";
}

router.post("/auth/email/start", async (req, res) => {
  const ip = forwardedIp(req);
  const outcome = await dispatchEmailVerificationCode({
    bodyEmail: req.body?.email,
    bodyPurpose: req.body?.purpose,
    ip,
  });
  if (!outcome.ok) {
    if (typeof outcome.retryAfterSeconds === "number") {
      res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
    }
    res.status(outcome.status).json({
      ok: false,
      error: outcome.error,
      ...(typeof outcome.retryAfterSeconds === "number"
        ? { retryAfterSeconds: outcome.retryAfterSeconds }
        : {}),
    });
    return;
  }
  res.json({ ok: true });
});

router.post("/auth/email/resend", async (req, res) => {
  const ip = forwardedIp(req);
  const outcome = await dispatchEmailVerificationCode({
    bodyEmail: req.body?.email,
    bodyPurpose: req.body?.purpose,
    ip,
  });
  if (!outcome.ok) {
    if (typeof outcome.retryAfterSeconds === "number") {
      res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
    }
    res.status(outcome.status).json({
      ok: false,
      error: outcome.error,
      ...(typeof outcome.retryAfterSeconds === "number"
        ? { retryAfterSeconds: outcome.retryAfterSeconds }
        : {}),
    });
    return;
  }
  res.json({ ok: true });
});

router.post("/auth/email/verify", async (req, res) => {
  const outcome = await verifyEmailCode({
    bodyEmail: req.body?.email,
    bodyCode: req.body?.code,
    bodyPurpose: req.body?.purpose,
  });
  if (!outcome.ok) {
    res.status(outcome.status).json({ ok: false, error: outcome.error });
    return;
  }
  res.json({
    ok: true,
    email: outcome.email,
    ...(outcome.proofToken ? { proofToken: outcome.proofToken } : {}),
  });
});

export default router;
