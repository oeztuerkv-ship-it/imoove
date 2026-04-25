import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import { findActivePanelUserProfileById } from "../db/panelAuthData";
import { getCompanyKind } from "../db/fleetDriversData";
import {
  getInsurerDashboardStats,
  getInsurerTransportDocumentFile,
  insertInsurerCostCenter,
  insertInsurerTransportDocument,
  listInsurerCostCenters,
  listInsurerRideRows,
  listTransportDocsForRide,
  patchInsurerCostCenter,
  patchRideInsurerOrgMeta,
} from "../db/insurerPanelData";
import { type PanelModuleId, resolveEffectivePanelModules } from "../domain/panelModules";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import { isPanelRoleString, type PanelPermission } from "../lib/panelPermissions";
import { insertPanelAuditLog } from "../db/panelAuditData";
import type { PanelRole } from "../lib/panelJwt";

const router: IRouter = Router();

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSURER_UPLOAD_ROOT = (process.env.INSURER_UPLOAD_DIR ?? "").trim() || path.join(pkgRoot, "uploads", "insurer-transport");

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Authorization");
  next();
});

function enabledInsurerPanelModules(panelModules: string[] | null, companyKind: string) {
  return resolveEffectivePanelModules(panelModules, companyKind);
}

async function assertInsurerPanel(
  req: PanelAuthRequest,
  res: express.Response,
): Promise<{
  claims: NonNullable<PanelAuthRequest["panelAuth"]>;
  profile: NonNullable<Awaited<ReturnType<typeof findActivePanelUserProfileById>>>;
} | null> {
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
  if (profile.companyId !== claims.companyId) {
    res.status(401).json({ error: "token_out_of_sync" });
    return null;
  }
  const kind = (await getCompanyKind(claims.companyId)) || "";
  if (kind !== "insurer") {
    res.status(403).json({ error: "insurer_portal_only" });
    return null;
  }
  return { claims, profile };
}

function denyUnlessInsurerModule(
  res: express.Response,
  profile: NonNullable<Awaited<ReturnType<typeof findActivePanelUserProfileById>>>,
  mod: PanelModuleId,
): boolean {
  const e = enabledInsurerPanelModules(profile.panelModules, profile.companyKind);
  if (!e.includes(mod)) {
    res.status(403).json({ error: "module_disabled", hint: mod });
    return false;
  }
  return true;
}

function denyUnlessInsurerPerm(
  res: express.Response,
  role: PanelRole,
  perm: PanelPermission,
): boolean {
  if (!denyUnlessPanelPermission(res, role, perm)) return false;
  return true;
}

router.get("/panel/v1/insurer/dashboard", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.read")) return;
    const metrics = await getInsurerDashboardStats(ctx.claims.companyId);
    res.json({ ok: true, ...metrics });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/insurer/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.read")) return;
    const rides = await listInsurerRideRows(ctx.claims.companyId);
    res.json({ ok: true, rides });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/insurer/cost-centers", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.read")) return;
    const costCenters = await listInsurerCostCenters(ctx.claims.companyId);
    res.json({ ok: true, costCenters });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/insurer/cost-centers", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.create")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof b.code === "string" ? b.code : "";
    const label = typeof b.label === "string" ? b.label : "";
    const out = await insertInsurerCostCenter(ctx.claims.companyId, { code, label });
    if (!out.ok) {
      res.status(400).json({ error: out.error });
      return;
    }
    res.status(201).json({ ok: true, costCenter: out.row });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/insurer/cost-centers/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.create")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: { label?: string; isActive?: boolean } = {};
    if (typeof b.label === "string") patch.label = b.label;
    if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
    const out = await patchInsurerCostCenter(ctx.claims.companyId, req.params.id, patch);
    if (!out.ok) {
      res.status(out.error === "not_found" ? 404 : 400).json({ error: out.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/insurer/rides/:rideId/organization", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
    if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.create")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const costCenterId = b.costCenterId === null || b.costCenterId === "" ? null : String(b.costCenterId);
    const passengerRef = b.passengerRef === null || b.passengerRef === undefined ? null : String(b.passengerRef);
    const out = await patchRideInsurerOrgMeta(ctx.claims.companyId, req.params.rideId, {
      costCenterId: costCenterId ?? null,
      passengerRef,
    });
    if (!out.ok) {
      const s = out.error === "ride_not_found" ? 404 : 400;
      res.status(s).json({ error: out.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "insurer.ride_org_meta_patched",
      subjectType: "ride",
      subjectId: req.params.rideId,
      meta: { hasCostCenter: Boolean(costCenterId) },
    });
    res.json({ ok: true, ride: out.ride });
  } catch (e) {
    next(e);
  }
});

router.get(
  "/panel/v1/insurer/rides/:rideId/transport-documents",
  requirePanelAuth,
  async (req, res, next) => {
    try {
      const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
      if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.read")) return;
      const docs = await listTransportDocsForRide(ctx.claims.companyId, req.params.rideId);
      res.json({ ok: true, documents: docs });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/panel/v1/insurer/rides/:rideId/transport-documents",
  requirePanelAuth,
  express.raw({ type: "*/*", limit: "8mb" }),
  async (req, res, next) => {
    try {
      const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
      if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.create")) return;
      const buf = req.body as Buffer;
      if (!buf || buf.length < 8) {
        res.status(400).json({ error: "file_body_required" });
        return;
      }
      const ct = String(req.headers["content-type"] || "").split(";")[0]!.trim().toLowerCase();
      const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
      if (!allowed.has(ct)) {
        res.status(400).json({ error: "unsupported_content_type" });
        return;
      }
      const ext = ct === "image/jpeg" ? "jpg" : ct === "image/png" ? "png" : "pdf";
      const nameHeader = (req.headers["x-file-name"] as string | undefined)?.trim() || `transport.${ext}`;
      const safeName = nameHeader.replace(/[\\/]+/g, "-").slice(0, 180);
      const rel = path.join(ctx.claims.companyId, "rides", req.params.rideId, `${randomUUID()}.${ext}`);
      const dest = path.join(INSURER_UPLOAD_ROOT, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      const storageKey = rel.replace(/\\/g, "/");
      const out = await insertInsurerTransportDocument(
        ctx.claims.companyId,
        req.params.rideId,
        ctx.claims.panelUserId,
        {
          storageKey,
          originalFilename: safeName,
          contentType: ct,
          byteSize: buf.length,
        },
      );
      if (!out.ok) {
        res.status(400).json({ error: out.error });
        return;
      }
      res.status(201).json({ ok: true, id: out.id, storageKey });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/panel/v1/insurer/transport-documents/:docId/file",
  requirePanelAuth,
  async (req, res, next) => {
    try {
      const ctx = await assertInsurerPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessInsurerModule(res, ctx.profile, "insurer_workspace")) return;
      if (!denyUnlessInsurerPerm(res, ctx.profile.role, "rides.read")) return;
      const meta = await getInsurerTransportDocumentFile(ctx.claims.companyId, req.params.docId);
      if (!meta) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const full = path.join(INSURER_UPLOAD_ROOT, meta.storageKey);
      res.setHeader("Content-Type", meta.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(meta.originalFilename)}"`);
      createReadStream(full).pipe(res);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
