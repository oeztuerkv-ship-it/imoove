import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { normalizeStoredPanelModules, PANEL_MODULE_DEFINITIONS } from "../domain/panelModules";
import { parsePayerKind, parseRideKind } from "../domain/rideBillingProfile";
import {
  addFareArea,
  type AdminCompanyUpdateBody,
  getAdminStats,
  findCompanyById,
  insertAdminCompany,
  listCompanies,
  listFareAreas,
  patchCompanyPanelModules,
  patchCompanyPriority,
  updateAdminCompany,
} from "../db/adminData";
import { attachAccessCodeSummariesToRides, insertAccessCodeAdmin, listAccessCodesAdmin } from "../db/accessCodesData";
import { insertPanelAuditLog } from "../db/panelAuditData";
import {
  findPanelUserInCompany,
  insertPanelUser,
  listPanelUsersInCompany,
  patchPanelUserInCompany,
  panelUsernameTaken,
  updatePanelUserPasswordInCompany,
} from "../db/panelUsersData";
import {
  adminReleaseRide,
  countRidesAdmin,
  findRideAdminById,
  listRidesAdminPage,
  type AdminRideListQuery,
} from "../db/ridesData";
import { hashPassword } from "../lib/password";
import { isPanelRoleString } from "../lib/panelPermissions";
import type { PanelRole } from "../lib/panelJwt";
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

adminJson.get("/companies/:companyId/panel-users", async (req, res, next) => {
  try {
    const company = await findCompanyById(req.params.companyId);
    if (!company) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    const users = await listPanelUsersInCompany(req.params.companyId);
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies/:companyId/panel-users", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const company = await findCompanyById(companyId);
    if (!company) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    if (!company.is_active) {
      res.status(400).json({ error: "company_inactive" });
      return;
    }
    const body = req.body as { username?: string; email?: string; role?: string; password?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const roleRaw = typeof body.role === "string" ? body.role.trim() : "";
    if (!username || !password || password.length < 10) {
      res.status(400).json({ error: "username_password_required", hint: "password min length 10" });
      return;
    }
    if (!isPanelRoleString(roleRaw)) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    const targetRole = roleRaw as PanelRole;
    if (await panelUsernameTaken(username.toLowerCase())) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    const hash = await hashPassword(password);
    const created = await insertPanelUser({
      companyId,
      username,
      email,
      role: targetRole,
      passwordHash: hash,
    });
    if (!created) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.panel_user.created",
      subjectType: "panel_user",
      subjectId: created.id,
      meta: { username, role: targetRole, source: "platform_admin_api" },
    });
    res.status(201).json({ ok: true, user: { id: created.id, username, email, role: targetRole } });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId/panel-users/:userId", async (req, res, next) => {
  try {
    const { companyId, userId } = req.params;
    const company = await findCompanyById(companyId);
    if (!company) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    const target = await findPanelUserInCompany(userId, companyId);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = req.body as {
      isActive?: boolean;
      role?: string;
      email?: string;
      username?: string;
    };
    const patch: {
      isActive?: boolean;
      role?: string;
      email?: string;
      username?: string;
    } = {};
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.role === "string" && body.role.trim()) {
      const tr = body.role.trim();
      if (!isPanelRoleString(tr)) {
        res.status(400).json({ error: "invalid_role" });
        return;
      }
      patch.role = tr;
    }
    if (typeof body.email === "string") patch.email = body.email.trim();
    if (typeof body.username === "string") {
      const u = body.username.trim();
      if (u.length < 2) {
        res.status(400).json({ error: "username_invalid" });
        return;
      }
      if (u.toLowerCase() !== target.username.toLowerCase()) {
        if (await panelUsernameTaken(u.toLowerCase(), userId)) {
          res.status(409).json({ error: "username_taken" });
          return;
        }
      }
      patch.username = u;
    }
    if (
      patch.isActive === undefined &&
      patch.role === undefined &&
      patch.email === undefined &&
      patch.username === undefined
    ) {
      res.status(400).json({ error: "no_changes" });
      return;
    }
    const updated = await patchPanelUserInCompany(userId, companyId, patch);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: patch.isActive === false ? "admin.panel_user.deactivated" : "admin.panel_user.updated",
      subjectType: "panel_user",
      subjectId: userId,
      meta: { source: "platform_admin_api" },
    });
    res.json({ ok: true, user: updated });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies/:companyId/panel-users/:userId/reset-password", async (req, res, next) => {
  try {
    const { companyId, userId } = req.params;
    const company = await findCompanyById(companyId);
    if (!company) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    const target = await findPanelUserInCompany(userId, companyId);
    if (!target || !target.is_active) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = req.body as { newPassword?: string };
    const neu = typeof body.newPassword === "string" ? body.newPassword : "";
    if (neu.length < 10) {
      res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
      return;
    }
    const hash = await hashPassword(neu);
    const ok = await updatePanelUserPasswordInCompany(userId, companyId, hash);
    if (!ok) {
      res.status(500).json({ error: "password_update_failed" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.panel_user.password_reset",
      subjectType: "panel_user",
      subjectId: userId,
      meta: { source: "platform_admin_api" },
    });
    res.json({ ok: true });
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
