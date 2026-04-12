import { Router, type IRouter, type Request } from "express";
import { normalizeStoredPanelModules, PANEL_MODULE_DEFINITIONS } from "../domain/panelModules";
import { parsePayerKind, parseRideKind } from "../domain/rideBillingProfile";
import {
  addFareArea,
  type AdminCompanyUpdateBody,
  getAdminStats,
  insertAdminCompany,
  listCompanies,
  listFareAreas,
  patchCompanyPanelModules,
  patchCompanyPriority,
  updateAdminCompany,
} from "../db/adminData";
import { attachAccessCodeSummariesToRides, insertAccessCodeAdmin, listAccessCodesAdmin } from "../db/accessCodesData";
import {
  adminReleaseRide,
  countRidesAdmin,
  findRideAdminById,
  listRidesAdminPage,
  type AdminRideListQuery,
} from "../db/ridesData";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";

export type { AdminAccessCodeRow, AdminDashboardStats, CompanyRow, FareAreaRow } from "./adminApi.types";

function parseStatsRevenueBound(v: unknown): Date | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseIsoDateParam(v: unknown, endOfDay: boolean): Date | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

function parseAdminRideListQuery(req: Request): { ok: true; query: AdminRideListQuery } | { ok: false; error: string } {
  const q = req.query as Record<string, string | undefined>;
  const query: AdminRideListQuery = {};
  if (typeof q.companyId === "string" && q.companyId.trim()) query.companyId = q.companyId.trim();
  if (typeof q.status === "string" && q.status.trim()) query.status = q.status.trim();
  const cf = parseIsoDateParam(q.createdFrom, false);
  const ct = parseIsoDateParam(q.createdTo, true);
  if (cf) query.createdFrom = cf;
  if (ct) query.createdTo = ct;
  if (typeof q.rideKind === "string" && q.rideKind.trim()) {
    const rk = parseRideKind(q.rideKind.trim());
    if (!rk) return { ok: false, error: "ride_kind_invalid" };
    query.rideKind = rk;
  }
  if (typeof q.payerKind === "string" && q.payerKind.trim()) {
    const pk = parsePayerKind(q.payerKind.trim());
    if (!pk) return { ok: false, error: "payer_kind_invalid" };
    query.payerKind = pk;
  }
  if (typeof q.driverId === "string" && q.driverId.trim()) query.driverId = q.driverId.trim();
  if (typeof q.q === "string" && q.q.trim()) query.q = q.q.trim();
  return { ok: true, query };
}

const router: IRouter = Router();

/**
 * Bearer nur für `/admin/*`-JSON — nicht `router.use()` auf die ganze Router-Instanz,
 * sonst würde jede später im Index gemountete Route (z. B. `GET /rides`) fälschlich 401 bekommen.
 */
const adminJson: IRouter = Router();
adminJson.use(requireAdminApiBearer);

adminJson.get("/stats", async (req, res, next) => {
  try {
    const q = req.query as Record<string, unknown>;
    const revenueFrom = parseStatsRevenueBound(q.revenueFrom);
    const revenueTo = parseStatsRevenueBound(q.revenueTo);
    const stats = await getAdminStats(
      revenueFrom && revenueTo ? { revenueFrom, revenueTo } : {},
    );
    res.json({ ok: true, stats });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/companies", async (_req, res, next) => {
  try {
    const items = await listCompanies();
    res.json({ ok: true, items, panelModuleCatalog: PANEL_MODULE_DEFINITIONS });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies", async (req, res, next) => {
  try {
    const b = req.body as { name?: unknown } & AdminCompanyUpdateBody;
    const name = typeof b.name === "string" ? b.name : "";
    const { name: _drop, ...rest } = b;
    const result = await insertAdminCompany({ name, ...rest });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true, item: result });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId", async (req, res, next) => {
  try {
    const body = req.body as AdminCompanyUpdateBody;
    const item = await updateAdminCompany(req.params.companyId, body);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/rides", async (req, res, next) => {
  try {
    const parsed = parseAdminRideListQuery(req);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const page = Math.min(500, Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const offset = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      countRidesAdmin(parsed.query),
      listRidesAdminPage(parsed.query, pageSize, offset),
    ]);
    const items = await attachAccessCodeSummariesToRides(rows);
    res.json({ ok: true, items, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/rides/:id", async (req, res, next) => {
  try {
    const row = await findRideAdminById(req.params.id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const [ride] = await attachAccessCodeSummariesToRides([row]);
    res.json({ ok: true, ride });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/rides/:id/release", async (req, res, next) => {
  try {
    const updated = await adminReleaseRide(req.params.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const full = await findRideAdminById(updated.id);
    const base = full ?? { ...updated, companyName: null };
    const [ride] = await attachAccessCodeSummariesToRides([base]);
    res.json({ ok: true, ride });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId/panel-modules", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const body = req.body as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, "panel_modules")) {
      res.status(400).json({ error: "panel_modules_required", hint: "null = alle Module, sonst string[]" });
      return;
    }
    const raw = body.panel_modules;
    let modules: string[] | null;
    if (raw === null) {
      modules = null;
    } else if (Array.isArray(raw)) {
      const n = normalizeStoredPanelModules(raw) ?? [];
      if (n.length === 0) {
        res.status(400).json({ error: "panel_modules_empty", hint: "Mindestens ein Modul, oder panel_modules: null für alle." });
        return;
      }
      modules = n;
    } else {
      res.status(400).json({ error: "panel_modules_invalid" });
      return;
    }
    const item = await patchCompanyPanelModules(companyId, modules);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId/priority", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const body = req.body as Partial<{
      is_priority_company: boolean;
      priority_for_live_rides: boolean;
      priority_for_reservations: boolean;
    }>;
    const item = await patchCompanyPriority(companyId, body);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/fare-areas", async (_req, res, next) => {
  try {
    const items = await listFareAreas();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/access-codes", async (_req, res, next) => {
  try {
    const items = await listAccessCodesAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/access-codes", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const generateCode = body.generateCode === true;
    const code = typeof body.code === "string" ? body.code : "";
    const codeType = typeof body.codeType === "string" ? body.codeType : "";
    const result = await insertAccessCodeAdmin({
      generate: generateCode,
      code,
      codeType,
      companyId: typeof body.companyId === "string" ? body.companyId : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      maxUses: typeof body.maxUses === "number" ? body.maxUses : undefined,
      validFrom: typeof body.validFrom === "string" ? body.validFrom : undefined,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : undefined,
    });
    if (!result.ok) {
      const err = result.error;
      if (err === "code_duplicate") {
        res.status(409).json({ error: err });
        return;
      }
      if (err === "code_generate_failed") {
        res.status(503).json({ error: err });
        return;
      }
      res.status(400).json({ error: err });
      return;
    }
    res.status(201).json({
      ok: true,
      item: result.item,
      ...(result.revealedCode ? { revealedCode: result.revealedCode } : {}),
    });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fare-areas", async (req, res, next) => {
  try {
    const body = req.body as Partial<{
      name: string;
      ruleType: string;
      isRequiredArea: string;
      fixedPriceAllowed: string;
      status: string;
    }>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    const items = await addFareArea({
      name,
      ruleType: typeof body.ruleType === "string" ? body.ruleType : "official_metered_tariff",
      isRequiredArea: typeof body.isRequiredArea === "string" ? body.isRequiredArea : "Ja",
      fixedPriceAllowed: typeof body.fixedPriceAllowed === "string" ? body.fixedPriceAllowed : "Prüfen",
      status: typeof body.status === "string" ? body.status : "aktiv",
    });
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.use("/admin", adminJson);

export default router;
