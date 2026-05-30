import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  deletePartnerMessageById,
  insertPartnerMessagesBatch,
  listPartnerMessagesAdminGroups,
  resolveAdminMessageRecipients,
} from "../db/partnerMessagesData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function sentByLabel(req: Request): string {
  return (req.adminAuth?.username ?? "admin").trim() || "admin";
}

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
}

router.get("/", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawLimit = req.query.limit;
    const limit =
      typeof rawLimit === "string" && /^\d+$/.test(rawLimit.trim())
        ? parseInt(rawLimit.trim(), 10)
        : 150;
    const groups = await listPartnerMessagesAdminGroups(
      typeof rawLimit === "string" && /^\d+$/.test(rawLimit.trim()) ? Math.min(120, parseInt(rawLimit.trim(), 10)) : 60,
    );
    res.json({ ok: true, groups });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = parseBody(req);
    const subject = typeof b.subject === "string" ? b.subject.trim() : "";
    const body = typeof b.body === "string" ? b.body.trim() : "";
    const companyIdRaw =
      typeof b.companyId === "string"
        ? b.companyId.trim()
        : typeof b.company_id === "string"
          ? b.company_id.trim()
          : "";
    if (!subject || subject.length > 200) {
      res.status(400).json({ error: "subject_invalid", hint: "max 200" });
      return;
    }
    if (!body || body.length > 20000) {
      res.status(400).json({ error: "body_invalid", hint: "max 20000" });
      return;
    }

    const resolved = await resolveAdminMessageRecipients(companyIdRaw);
    if (!resolved) {
      res.status(400).json({ error: "invalid_recipient", hint: "alle, kind:hotel, kind:taxi, … oder Mandanten-ID" });
      return;
    }

    if (resolved.companyIds.length === 0) {
      res.status(400).json({ error: "no_recipients", target: resolved.targetKey });
      return;
    }

    const items = await insertPartnerMessagesBatch({
      companyIds: resolved.companyIds,
      subject,
      body,
      createdByAdmin: sentByLabel(req),
    });
    res.status(201).json({
      ok: true,
      recipientCount: items.length,
      broadcast: resolved.mode === "broadcast",
      target: resolved.targetKey,
      targetLabel: resolved.targetLabel,
      items,
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/:messageId", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const messageId = String(req.params.messageId ?? "").trim();
    if (!messageId) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const ok = await deletePartnerMessageById(messageId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
