import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import type { RideRequest } from "../domain/rideRequest";
import { isPostgresConfigured } from "../db/client";
import { insertPanelAuditLog } from "../db/panelAuditData";
import { findActivePanelUserById, findActivePanelUserProfileById } from "../db/panelAuthData";
import { getPanelCompanyById } from "../db/panelCompanyData";
import {
  findPanelUserInCompany,
  insertPanelUser,
  listPanelUsersInCompany,
  patchPanelUserInCompany,
  getPanelUsernamesInCompany,
  panelUsernameTaken,
  updatePanelUserPasswordInCompany,
} from "../db/panelUsersData";
import { insertRide, listRidesForCompany } from "../db/ridesData";
import type { PanelRole } from "../lib/panelJwt";
import {
  isPanelRoleString,
  panelCan,
  permissionsForRole,
  type PanelPermission,
} from "../lib/panelPermissions";
import { hashPassword, verifyPassword } from "../lib/password";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";

const router: IRouter = Router();

async function assertActivePanelProfile(req: PanelAuthRequest, res: Response) {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return null;
  }
  const claims = req.panelAuth;
  if (!claims) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const profile = await findActivePanelUserProfileById(claims.panelUserId);
  if (!profile || !isPanelRoleString(profile.role)) {
    res.status(401).json({ error: "user_inactive_or_missing" });
    return null;
  }
  if (profile.companyId !== claims.companyId || profile.username !== claims.username) {
    res.status(401).json({ error: "token_out_of_sync" });
    return null;
  }
  return { claims, profile };
}

function denyUnless(
  res: Response,
  profileRole: string,
  permission: PanelPermission,
): profileRole is PanelRole {
  if (!isPanelRoleString(profileRole)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  if (!panelCan(profileRole, permission)) {
    res.status(403).json({ error: "forbidden", hint: permission });
    return false;
  }
  return true;
}

function canAssignPanelRole(actor: PanelRole, target: PanelRole): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") {
    return target === "manager" || target === "staff" || target === "readonly";
  }
  return false;
}

router.get("/panel/v1/health", requirePanelAuth, (_req, res) => {
  res.json({ ok: true, service: "onroda-panel-api" });
});

router.get("/panel/v1/me", requirePanelAuth, async (req, res) => {
  const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
  if (!ctx) return;
  const { profile } = ctx;
  const role = profile.role as PanelRole;

  res.json({
    ok: true,
    user: {
      id: profile.id,
      companyId: profile.companyId,
      companyName: profile.companyName,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      permissions: permissionsForRole(role),
    },
  });
});

router.get("/panel/v1/company", requirePanelAuth, async (req, res) => {
  const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
  if (!ctx) return;
  const { claims } = ctx;

  const company = await getPanelCompanyById(claims.companyId);
  if (!company) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }

  res.json({ ok: true, company });
});

router.get("/panel/v1/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "rides.read")) return;
    const rides = await listRidesForCompany(ctx.claims.companyId);
    const ids = rides.map((r) => r.createdByPanelUserId).filter((x): x is string => Boolean(x));
    const names = await getPanelUsernamesInCompany(ctx.claims.companyId, ids);
    const ridesOut = rides.map((r) => ({
      ...r,
      createdByUsername: r.createdByPanelUserId ? (names[r.createdByPanelUserId] ?? null) : null,
    }));
    res.json({ ok: true, rides: ridesOut });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "rides.create")) return;

      const body = req.body as Record<string, unknown>;
      const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
      if (!customerName) {
        res.status(400).json({ error: "customer_name_required" });
        return;
      }

      const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
      const num = (k: string) =>
        typeof body[k] === "number" && Number.isFinite(body[k] as number) ? (body[k] as number) : NaN;
      const optStr = (k: string) => {
        const v = body[k];
        if (v == null) return undefined;
        return typeof v === "string" ? v : undefined;
      };
      const optNum = (k: string) => {
        const v = body[k];
        if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
        return v;
      };

      const from = str("from").trim();
      const fromFull = str("fromFull").trim();
      const to = str("to").trim();
      const toFull = str("toFull").trim();
      const distanceKm = num("distanceKm");
      const durationMinutes = num("durationMinutes");
      const estimatedFare = num("estimatedFare");
      const paymentMethod = str("paymentMethod").trim();
      const vehicle = str("vehicle").trim();

      if (!from || !fromFull || !to || !toFull) {
        res.status(400).json({ error: "route_fields_required" });
        return;
      }
      if (
        !Number.isFinite(distanceKm) ||
        !Number.isFinite(durationMinutes) ||
        !Number.isFinite(estimatedFare) ||
        !paymentMethod ||
        !vehicle
      ) {
        res.status(400).json({ error: "pricing_or_vehicle_invalid" });
        return;
      }

      const scheduledRaw = optStr("scheduledAt");
      const passengerId = optStr("passengerId");

      const newReq: RideRequest = {
        id: `REQ-${Date.now()}`,
        companyId: ctx.claims.companyId,
        createdByPanelUserId: ctx.claims.panelUserId,
        createdAt: new Date().toISOString(),
        scheduledAt: scheduledRaw && scheduledRaw.length > 0 ? scheduledRaw : null,
        status: "pending",
        rejectedBy: [],
        driverId: null,
        customerName,
        ...(passengerId ? { passengerId } : {}),
        from,
        fromFull,
        fromLat: optNum("fromLat"),
        fromLon: optNum("fromLon"),
        to,
        toFull,
        toLat: optNum("toLat"),
        toLon: optNum("toLon"),
        distanceKm,
        durationMinutes,
        estimatedFare,
        finalFare: null,
        paymentMethod,
        vehicle,
      };

      await insertRide(newReq);
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "ride.created",
        subjectType: "ride",
        subjectId: newReq.id,
        meta: { customerName: newReq.customerName },
      });
    res.status(201).json({ ok: true, ride: newReq });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/me/change-password", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "self.change_password")) return;
      const body = req.body as { currentPassword?: string; newPassword?: string };
      const cur = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const neu = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!cur || neu.length < 10) {
        res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
        return;
      }
      const row = await findActivePanelUserById(ctx.claims.panelUserId);
      if (!row) {
        res.status(401).json({ error: "user_not_found" });
        return;
      }
      const ok = await verifyPassword(cur, row.password_hash);
      if (!ok) {
        res.status(401).json({ error: "invalid_current_password" });
        return;
      }
      const hash = await hashPassword(neu);
      const updated = await updatePanelUserPasswordInCompany(row.id, row.company_id, hash);
      if (!updated) {
        res.status(500).json({ error: "password_update_failed" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "user.self_password_change",
        subjectType: "panel_user",
        subjectId: row.id,
        meta: {},
      });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/users", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "users.read")) return;
    const users = await listPanelUsersInCompany(ctx.claims.companyId);
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/users", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "users.manage")) return;
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
    if (!canAssignPanelRole(ctx.profile.role as PanelRole, targetRole)) {
      res.status(403).json({ error: "forbidden_role_assignment" });
      return;
    }
    if (await panelUsernameTaken(username.toLowerCase())) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    const hash = await hashPassword(password);
    const created = await insertPanelUser({
      companyId: ctx.claims.companyId,
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
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "user.created",
      subjectType: "panel_user",
      subjectId: created.id,
      meta: { username, role: targetRole },
    });
    res.status(201).json({ ok: true, user: { id: created.id, username, email, role: targetRole } });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/users/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "users.manage")) return;
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "id_required" });
        return;
      }
      const target = await findPanelUserInCompany(id, ctx.claims.companyId);
      if (!target) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (target.id === ctx.claims.panelUserId) {
        res.status(400).json({ error: "cannot_modify_self_here" });
        return;
      }
      if (ctx.profile.role === "manager" && target.role === "owner") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = req.body as { isActive?: boolean; role?: string };
      const patch: { isActive?: boolean; role?: string } = {};
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      if (typeof body.role === "string" && body.role.trim()) {
        if (!isPanelRoleString(body.role.trim())) {
          res.status(400).json({ error: "invalid_role" });
          return;
        }
        const tr = body.role.trim() as PanelRole;
        if (!canAssignPanelRole(ctx.profile.role as PanelRole, tr)) {
          res.status(403).json({ error: "forbidden_role_assignment" });
          return;
        }
        patch.role = tr;
      }
      if (patch.isActive === undefined && patch.role === undefined) {
        res.status(400).json({ error: "no_changes" });
        return;
      }
      const updated = await patchPanelUserInCompany(id, ctx.claims.companyId, patch);
      if (!updated) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: patch.isActive === false ? "user.deactivated" : "user.updated",
        subjectType: "panel_user",
        subjectId: id,
        meta: patch,
      });
    res.json({ ok: true, user: updated });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/users/:id/reset-password", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnless(res, ctx.profile.role, "users.reset_password")) return;
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "id_required" });
        return;
      }
      const target = await findPanelUserInCompany(id, ctx.claims.companyId);
      if (!target || !target.is_active) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (target.id === ctx.claims.panelUserId) {
        res.status(400).json({ error: "use_change_password_for_self" });
        return;
      }
      if (ctx.profile.role === "manager" && target.role === "owner") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = req.body as { newPassword?: string };
      const neu = typeof body.newPassword === "string" ? body.newPassword : "";
      if (neu.length < 10) {
        res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
        return;
      }
      const hash = await hashPassword(neu);
      const ok = await updatePanelUserPasswordInCompany(id, ctx.claims.companyId, hash);
      if (!ok) {
        res.status(500).json({ error: "password_update_failed" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "user.password_reset",
        subjectType: "panel_user",
        subjectId: id,
        meta: {},
      });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
