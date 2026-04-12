import { Router, type IRouter } from "express";
import { normalizeStoredPanelModules, PANEL_MODULE_DEFINITIONS } from "../domain/panelModules";
import {
  addFareArea,
  getAdminStats,
  listCompanies,
  listFareAreas,
  patchCompanyPanelModules,
  patchCompanyPriority,
} from "../db/adminData";
import { insertAccessCodeAdmin, listAccessCodesAdmin } from "../db/accessCodesData";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";

export type { AdminAccessCodeRow, AdminDashboardStats, CompanyRow, FareAreaRow } from "./adminApi.types";

function parseStatsRevenueBound(v: unknown): Date | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
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
