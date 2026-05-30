import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  deletePartnerMessageById,
  insertPartnerMessagesBatch,
  listPartnerMessageRecipientCompanyIds,
  listPartnerMessagesAdmin,
  partnerCompanyExistsForMessages,
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
    const items = await listPartnerMessagesAdmin(limit);
    res.json({ ok: true, items });
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

    const broadcast =
      companyIdRaw === "" ||
      companyIdRaw.toLowerCase() === "alle" ||
      companyIdRaw.toLowerCase() === "all";

    let companyIds: string[] = [];
    if (broadcast) {
      companyIds = await listPartnerMessageRecipientCompanyIds();
    } else {
      const ok = await partnerCompanyExistsForMessages(companyIdRaw);
      if (!ok) {
        res.status(404).json({ error: "company_not_found" });
        return;
      }
      companyIds = [companyIdRaw];
    }

    if (companyIds.length === 0) {
      res.status(400).json({ error: "no_recipients" });
      return;
    }

    const items = await insertPartnerMessagesBatch({
      companyIds,
      subject,
      body,
      createdByAdmin: sentByLabel(req),
    });
    res.status(201).json({
      ok: true,
      recipientCount: items.length,
      broadcast,
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
