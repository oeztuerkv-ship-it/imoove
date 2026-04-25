import { createReadStream, existsSync } from "node:fs";
import { Router, type IRouter, type Request, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  createInsurerExportBatch,
  getInsurerExportBatchById,
  getInsurerRideDetail,
  getInsurerSummary,
  listInsurerExportBatches,
  listInsurerRides,
  resolveInsurerExportFilePath,
} from "../db/insurerRideProjectionData";
import { canAccessInsurerAdminApi, type AdminRole } from "../lib/adminConsoleRoles";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireAdminApiBearer);

function insurerRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function requireInsurer(_req: Request, res: Response, next: () => void) {
  if (!canAccessInsurerAdminApi(insurerRole(_req as Request))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

router.use(requireInsurer);

function parseDate(v: unknown, endOfDay: boolean): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function parsePagination(req: Request): { page: number; pageSize: number } {
  const page = Math.min(200, Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
  return { page, pageSize };
}

/**
 * GET /api/admin/insurance/summary
 * Query: from, to (ISO), companyId (optional) — Fahrten mit payer_kind=insurance.
 */
router.get("/summary", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const fromD = parseDate(req.query.from, false);
    const toD = parseDate(req.query.to, true);
    if (!fromD || !toD) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : undefined;
    const summary = await getInsurerSummary(
      insurerRole(req),
      req.adminAuth?.scopeCompanyId,
      fromD,
      toD,
      companyId,
      "insurance",
    );
    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/insurance/rides
 */
router.get("/rides", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const fromD = parseDate(req.query.from, false);
    const toD = parseDate(req.query.to, true);
    if (!fromD || !toD) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    const { page, pageSize } = parsePagination(req);
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const { items, total } = await listInsurerRides(
      insurerRole(req),
      req.adminAuth?.scopeCompanyId,
      {
        createdFrom: fromD,
        createdTo: toD,
        companyId,
        status,
        payerKind: "insurance",
      },
      page,
      pageSize,
    );
    res.json({ ok: true, items, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/insurance/rides/:rideId
 */
router.get("/rides/:rideId", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.rideId ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const detail = await getInsurerRideDetail(insurerRole(req), req.adminAuth?.scopeCompanyId, id);
    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, ride: detail, corrections: detail.corrections ?? [] });
  } catch (e) {
    next(e);
  }
});

/** GET /api/admin/insurance/exports */
router.get("/exports", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const items = await listInsurerExportBatches(limit);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/admin/insurance/exports
 * Body: { periodFrom, periodTo, companyId? }
 */
router.post("/exports", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const pf = typeof b.periodFrom === "string" ? b.periodFrom : "";
    const pt = typeof b.periodTo === "string" ? b.periodTo : "";
    const fromD = parseDate(pf, false);
    const toD = parseDate(pt, true);
    if (!fromD || !toD) {
      res.status(400).json({ error: "period_from_to_required" });
      return;
    }
    const companyId = typeof b.companyId === "string" && b.companyId.trim() ? b.companyId.trim() : undefined;
    const label = (req.adminAuth?.username && req.adminAuth.username.trim()) || "api_bearer";
    const r = await createInsurerExportBatch({
      createdByLabel: label,
      periodFrom: fromD,
      periodTo: toD,
      companyIdFilter: companyId,
      role: insurerRole(req),
      scopeCompanyId: req.adminAuth?.scopeCompanyId,
    });
    if (!r) {
      res.status(503).json({ error: "export_failed" });
      return;
    }
    logger.info({ event: "admin.insurance.export", batchId: r.batchId, rowCount: r.rowCount }, "insurance export");
    res.status(201).json({ ok: true, batchId: r.batchId, rowCount: r.rowCount, fileName: r.fileName });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/insurance/exports/:id/download
 */
router.get("/exports/:id/download", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const batch = await getInsurerExportBatchById(id);
    if (!batch) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const rel = (batch.file_rel_path ?? "").trim();
    if (!rel) {
      res.status(404).json({ error: "file_missing" });
      return;
    }
    const abs = resolveInsurerExportFilePath(rel);
    if (!abs || !existsSync(abs)) {
      res.status(404).json({ error: "file_missing" });
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="insurance-export-${id}.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    createReadStream(abs)
      .on("error", (err) => {
        logger.warn({ err, id }, "insurance export download");
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res);
  } catch (e) {
    next(e);
  }
});

export default router;
