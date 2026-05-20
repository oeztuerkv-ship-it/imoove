import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  createAppFaqItem,
  deleteAppFaqItem,
  findAppFaqAdmin,
  listAppFaqAdmin,
  parseAppFaqCategory,
  patchAppFaqItem,
  type AppFaqCategory,
} from "../db/appFaqData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
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
    const items = await listAppFaqAdmin();
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
    const question = typeof b.question === "string" ? b.question.trim() : "";
    const answer = typeof b.answer === "string" ? b.answer.trim() : "";
    if (!question || !answer) {
      res.status(400).json({ error: "question_answer_required" });
      return;
    }
    const category = parseAppFaqCategory(typeof b.category === "string" ? b.category : undefined);
    const sortOrder = Number.isFinite(Number(b.sortOrder ?? b.sort_order)) ? Number(b.sortOrder ?? b.sort_order) : 0;
    const active = b.active === false ? false : true;
    const item = await createAppFaqItem({ question, answer, category, sortOrder, active });
    if (!item) {
      res.status(500).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const existing = await findAppFaqAdmin(id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const b = parseBody(req);
    const patch: Parameters<typeof patchAppFaqItem>[1] = {};
    if (typeof b.question === "string") patch.question = b.question.trim();
    if (typeof b.answer === "string") patch.answer = b.answer.trim();
    if (typeof b.category === "string") patch.category = parseAppFaqCategory(b.category) as AppFaqCategory;
    if (b.sortOrder !== undefined || b.sort_order !== undefined) {
      patch.sortOrder = Number(b.sortOrder ?? b.sort_order) || 0;
    }
    if (typeof b.active === "boolean") patch.active = b.active;
    const item = await patchAppFaqItem(id, patch);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const ok = await deleteAppFaqItem(id);
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
