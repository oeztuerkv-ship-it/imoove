import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type IRouter } from "express";
import { insertComplianceDocumentUpload } from "../db/companyComplianceDocumentsData";
import { insertPanelAuditLog } from "../db/panelAuditData";
import { isPostgresConfigured } from "../db/client";
import {
  activateFleetDriver,
  countFleetDriversOnline,
  countFleetDriversPScheinExpiringSoon,
  findFleetDriverInCompany,
  getCompanyKind,
  insertFleetDriver,
  listFleetDriversForCompany,
  patchFleetDriverProfile,
  suspendFleetDriver,
  type FleetVehicleClass as FleetDriverVehicleClass,
  type FleetVehicleLegalType as FleetDriverVehicleLegalType,
  updateFleetDriverPassword,
} from "../db/fleetDriversData";
import {
  appendFleetVehicleDocument,
  countActiveFleetVehicles,
  insertFleetVehicle,
  listFleetVehicleDocumentStorageKeysInCompany,
  listFleetVehiclesForCompany,
  patchFleetVehicle,
  submitFleetVehicleForApproval,
  type FleetVehicleClass,
  type FleetVehicleLegalType,
  type FleetVehicleType,
} from "../db/fleetVehiclesData";
import {
  clearDriverAssignment,
  listAssignmentsForCompany,
  setDriverVehicleAssignment,
} from "../db/fleetAssignmentsData";
import {
  countFleetDriversForCompany,
  countFleetVehiclesForCompany,
  getCompanyGovernanceGate,
} from "../db/companyGovernanceData";
import { hashPassword } from "../lib/password";
import { generateTemporaryPassword } from "../lib/tempPassword";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import { findActivePanelUserProfileById } from "../db/panelAuthData";
import type { PanelRole } from "../lib/panelJwt";
import { isPanelRoleString } from "../lib/panelPermissions";
import { resolveEffectivePanelModules } from "../domain/panelModules";
import { getPanelFleetDriverViews } from "../db/fleetDriverReadiness";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Authorization");
  next();
});

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FLEET_UPLOAD_ROOT = (process.env.FLEET_UPLOAD_DIR ?? "").trim() || path.join(pkgRoot, "data", "fleet-uploads");
const ALLOWED_VEHICLE_LEGAL_TYPES: FleetVehicleLegalType[] = ["taxi"];
const ALLOWED_VEHICLE_CLASSES: FleetVehicleClass[] = ["standard", "xl", "wheelchair"];

function enabledPanelModules(panelModules: string[] | null, companyKind: string) {
  return resolveEffectivePanelModules(panelModules, companyKind);
}

async function assertFleetPanel(
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
  const kind = await getCompanyKind(profile.companyId);
  if (kind !== "taxi") {
    res.status(403).json({ error: "fleet_only_taxi_company" });
    return null;
  }
  if (!enabledPanelModules(profile.panelModules, kind).includes("taxi_fleet")) {
    res.status(403).json({ error: "module_not_enabled", module: "taxi_fleet" });
    return null;
  }
  return { claims, profile };
}

async function requireFleetProvisioningReady(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await getCompanyGovernanceGate(companyId);
  if (!gate) return { ok: false, error: "company_not_found" };
  if (gate.companyKind !== "taxi") return { ok: false, error: "fleet_only_taxi_company" };
  if (gate.isBlocked) return { ok: false, error: "company_blocked" };
  if (gate.verificationStatus !== "verified") return { ok: false, error: "company_not_verified" };
  if (gate.complianceStatus !== "compliant") return { ok: false, error: "company_not_compliant" };
  if (gate.contractStatus !== "active") return { ok: false, error: "contract_not_active" };
  if (!gate.requiredProfileComplete) return { ok: false, error: "company_profile_incomplete" };
  return { ok: true };
}

router.get("/panel/v1/fleet/dashboard", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.read")) return;
    const companyId = ctx.claims.companyId;
    const [drivers, vehicles] = await Promise.all([
      listFleetDriversForCompany(companyId),
      listFleetVehiclesForCompany(companyId),
    ]);
    const online = await countFleetDriversOnline(companyId, 120);
    const pScheinSoon = await countFleetDriversPScheinExpiringSoon(companyId, 30);
    const vehiclesActive = await countActiveFleetVehicles(companyId);
    res.json({
      ok: true,
      driversOnline: online,
      driversTotal: drivers.length,
      vehiclesActive,
      vehiclesTotal: vehicles.length,
      pScheinExpiringWithin30Days: pScheinSoon,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fleet/drivers", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.read")) return;
    const onlyExpiring =
      String((req.query as { pScheinExpiring?: string }).pScheinExpiring ?? "") === "1";
    let rows = await getPanelFleetDriverViews(ctx.claims.companyId);
    if (onlyExpiring) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const until = new Date(today);
      until.setUTCDate(until.getUTCDate() + 30);
      const t0 = today.toISOString().slice(0, 10);
      const t1 = until.toISOString().slice(0, 10);
      rows = rows.filter((d) => {
        if (!d.pScheinExpiry) return false;
        return d.pScheinExpiry >= t0 && d.pScheinExpiry <= t1;
      });
    }
    const publicRows = rows.map((d) => {
      const { adminInternalNote: _a, ...rest } = d as typeof d & { adminInternalNote?: string };
      return rest;
    });
    res.json({ ok: true, drivers: publicRows });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/drivers", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = req.body as Record<string, unknown>;
    const gate = await requireFleetProvisioningReady(ctx.claims.companyId);
    if (!gate.ok) {
      res.status(403).json({ error: gate.error });
      return;
    }
    const c = await countFleetDriversForCompany(ctx.claims.companyId);
    const limits = await getCompanyGovernanceGate(ctx.claims.companyId);
    if (limits && c >= limits.maxDrivers) {
      res.status(403).json({ error: "driver_limit_reached", maxDrivers: limits.maxDrivers });
      return;
    }
    const email = typeof b.email === "string" ? b.email : "";
    const firstName = typeof b.firstName === "string" ? b.firstName : "";
    const lastName = typeof b.lastName === "string" ? b.lastName : "";
    const phone = typeof b.phone === "string" ? b.phone : "";
    const vehicleLegalType = "taxi" as FleetDriverVehicleLegalType;
    const vehicleClass = (typeof b.vehicleClass === "string" ? b.vehicleClass : "standard") as FleetDriverVehicleClass;
    if (!ALLOWED_VEHICLE_LEGAL_TYPES.includes(vehicleLegalType as FleetVehicleLegalType)) {
      res.status(400).json({ error: "vehicle_legal_type_invalid" });
      return;
    }
    if (!ALLOWED_VEHICLE_CLASSES.includes(vehicleClass as FleetVehicleClass)) {
      res.status(400).json({ error: "vehicle_class_invalid" });
      return;
    }
    const initialPassword =
      typeof b.initialPassword === "string" && b.initialPassword.length >= 10
        ? b.initialPassword
        : generateTemporaryPassword();
    const hash = await hashPassword(initialPassword);
    const ins = await insertFleetDriver({
      companyId: ctx.claims.companyId,
      email,
      firstName,
      lastName,
      phone,
      passwordHash: hash,
      mustChangePassword: true,
      vehicleLegalType,
      vehicleClass,
    });
    if (!ins.ok) {
      const code = ins.error;
      res.status(code === "email_taken" ? 409 : 400).json({ error: code });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.driver_created",
      subjectType: "fleet_driver",
      subjectId: ins.id,
      meta: { email: email.trim().toLowerCase() },
    });
    res.status(201).json({ ok: true, id: ins.id, initialPassword });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/fleet/drivers/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const id = req.params.id;
    const b = req.body as Record<string, unknown>;
    const patch: Parameters<typeof patchFleetDriverProfile>[2] = {};
    if (typeof b.firstName === "string") patch.firstName = b.firstName;
    if (typeof b.lastName === "string") patch.lastName = b.lastName;
    if (typeof b.phone === "string") patch.phone = b.phone;
    if (typeof b.pScheinNumber === "string") patch.pScheinNumber = b.pScheinNumber;
    if (typeof b.vehicleLegalType === "string") {
      patch.vehicleLegalType = "taxi" as FleetDriverVehicleLegalType;
    }
    if (typeof b.vehicleClass === "string") {
      if (!ALLOWED_VEHICLE_CLASSES.includes(b.vehicleClass as FleetVehicleClass)) {
        res.status(400).json({ error: "vehicle_class_invalid" });
        return;
      }
      patch.vehicleClass = b.vehicleClass as FleetDriverVehicleClass;
    }
    if (b.pScheinExpiry === null || typeof b.pScheinExpiry === "string") {
      patch.pScheinExpiry = b.pScheinExpiry === null ? null : b.pScheinExpiry;
    }
    const r = await patchFleetDriverProfile(id, ctx.claims.companyId, patch);
    if (!r.ok) {
      res.status(404).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/drivers/:id/suspend", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const ok = await suspendFleetDriver(req.params.id, ctx.claims.companyId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.driver_suspended",
      subjectType: "fleet_driver",
      subjectId: req.params.id,
      meta: {},
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/drivers/:id/activate", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const ok = await activateFleetDriver(req.params.id, ctx.claims.companyId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.driver_activated",
      subjectType: "fleet_driver",
      subjectId: req.params.id,
      meta: {},
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/drivers/:id/reset-password", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = req.body as { newPassword?: string };
    const neu =
      typeof b.newPassword === "string" && b.newPassword.length >= 10
        ? b.newPassword
        : generateTemporaryPassword();
    const hash = await hashPassword(neu);
    const ok = await updateFleetDriverPassword(req.params.id, ctx.claims.companyId, hash, true);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.driver_password_reset",
      subjectType: "fleet_driver",
      subjectId: req.params.id,
      meta: {},
    });
    res.json({ ok: true, newPassword: neu });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/panel/v1/fleet/drivers/:id/p-schein-doc",
  requirePanelAuth,
  express.raw({ type: "application/pdf", limit: "6mb" }),
  async (req, res, next) => {
    try {
      const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
      const buf = req.body as Buffer;
      if (!buf || buf.length < 8) {
        res.status(400).json({ error: "pdf_body_required" });
        return;
      }
      const id = req.params.id;
      const row = await findFleetDriverInCompany(id, ctx.claims.companyId);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const rel = path.join(ctx.claims.companyId, "drivers", `${id}-${randomUUID()}.pdf`);
      const dest = path.join(FLEET_UPLOAD_ROOT, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      const storageKey = rel.replace(/\\/g, "/");
      const pr = await patchFleetDriverProfile(id, ctx.claims.companyId, { pScheinDocStorageKey: storageKey });
      if (!pr.ok) {
        res.status(500).json({ error: "update_failed" });
        return;
      }
      res.json({ ok: true, storageKey });
    } catch (e) {
      next(e);
    }
  },
);

router.get("/panel/v1/fleet/vehicles", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.read")) return;
    let rows = await listFleetVehiclesForCompany(ctx.claims.companyId);
    if (String((req.query as { activeOnly?: string }).activeOnly ?? "") === "1") {
      rows = rows.filter((v) => v.approvalStatus === "approved");
    }
    const publicV = rows.map((v) => {
      const { adminInternalNote: _a, ...rest } = v as typeof v & { adminInternalNote?: string };
      return rest;
    });
    res.json({ ok: true, vehicles: publicV });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/vehicles", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = req.body as Record<string, unknown>;
    const gate = await requireFleetProvisioningReady(ctx.claims.companyId);
    if (!gate.ok) {
      res.status(403).json({ error: gate.error });
      return;
    }
    const c = await countFleetVehiclesForCompany(ctx.claims.companyId);
    const limits = await getCompanyGovernanceGate(ctx.claims.companyId);
    if (limits && c >= limits.maxVehicles) {
      res.status(403).json({ error: "vehicle_limit_reached", maxVehicles: limits.maxVehicles });
      return;
    }
    const licensePlate = typeof b.licensePlate === "string" ? b.licensePlate : "";
    const konzessionRaw =
      typeof b.konzessionNumber === "string"
        ? b.konzessionNumber
        : typeof b.taxiOrderNumber === "string"
          ? b.taxiOrderNumber
          : "";
    const vehicleType = (typeof b.vehicleType === "string" ? b.vehicleType : "sedan") as FleetVehicleType;
    const vehicleLegalType = "taxi" as FleetVehicleLegalType;
    const vehicleClass = (typeof b.vehicleClass === "string" ? b.vehicleClass : "standard") as FleetVehicleClass;
    const allowed: FleetVehicleType[] = ["sedan", "station_wagon", "van", "wheelchair"];
    if (!allowed.includes(vehicleType)) {
      res.status(400).json({ error: "invalid_vehicle_type" });
      return;
    }
    if (!ALLOWED_VEHICLE_LEGAL_TYPES.includes(vehicleLegalType)) {
      res.status(400).json({ error: "vehicle_legal_type_invalid" });
      return;
    }
    if (!ALLOWED_VEHICLE_CLASSES.includes(vehicleClass)) {
      res.status(400).json({ error: "vehicle_class_invalid" });
      return;
    }
    const ins = await insertFleetVehicle({
      companyId: ctx.claims.companyId,
      licensePlate,
      vin: typeof b.vin === "string" ? b.vin : "",
      color: typeof b.color === "string" ? b.color : "",
      model: typeof b.model === "string" ? b.model : "",
      vehicleType,
      vehicleLegalType,
      vehicleClass,
      taxiOrderNumber: typeof b.taxiOrderNumber === "string" ? b.taxiOrderNumber : "",
      konzessionNumber: konzessionRaw,
      nextInspectionDate: typeof b.nextInspectionDate === "string" ? b.nextInspectionDate : null,
      approvalStatus: "draft",
    });
    if (!ins.ok) {
      res.status(400).json({ error: ins.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.vehicle_created",
      subjectType: "fleet_vehicle",
      subjectId: ins.id,
      meta: { licensePlate },
    });
    res.status(201).json({ ok: true, id: ins.id });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/fleet/vehicles/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = req.body as Record<string, unknown>;
    const patch: Parameters<typeof patchFleetVehicle>[2] = {};
    if (typeof b.licensePlate === "string") patch.licensePlate = b.licensePlate;
    if (typeof b.vin === "string") patch.vin = b.vin;
    if (typeof b.color === "string") patch.color = b.color;
    if (typeof b.model === "string") patch.model = b.model;
    if (typeof b.taxiOrderNumber === "string") patch.taxiOrderNumber = b.taxiOrderNumber;
    if (typeof b.konzessionNumber === "string") patch.konzessionNumber = b.konzessionNumber;
    if (typeof b.nextInspectionDate === "string" || b.nextInspectionDate === null) {
      patch.nextInspectionDate =
        b.nextInspectionDate === null ? null : (b.nextInspectionDate as string);
    }
    if (typeof b.vehicleLegalType === "string") {
      patch.vehicleLegalType = "taxi" as FleetVehicleLegalType;
    }
    if (typeof b.vehicleClass === "string") {
      const cls = b.vehicleClass as FleetVehicleClass;
      if (!ALLOWED_VEHICLE_CLASSES.includes(cls)) {
        res.status(400).json({ error: "vehicle_class_invalid" });
        return;
      }
      patch.vehicleClass = cls;
    }
    if (typeof b.vehicleType === "string") {
      const vt = b.vehicleType as FleetVehicleType;
      const allowed: FleetVehicleType[] = ["sedan", "station_wagon", "van", "wheelchair"];
      if (!allowed.includes(vt)) {
        res.status(400).json({ error: "invalid_vehicle_type" });
        return;
      }
      patch.vehicleType = vt;
    }
    const r = await patchFleetVehicle(req.params.id, ctx.claims.companyId, patch);
    if (!r.ok) {
      res.status(404).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fleet/assignments", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.read")) return;
    const rows = await listAssignmentsForCompany(ctx.claims.companyId);
    res.json({ ok: true, assignments: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fleet/assignments", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = req.body as { driverId?: string; vehicleId?: string };
    const driverId = typeof b.driverId === "string" ? b.driverId : "";
    const vehicleId = typeof b.vehicleId === "string" ? b.vehicleId : "";
    const r = await setDriverVehicleAssignment({
      companyId: ctx.claims.companyId,
      driverId,
      vehicleId,
    });
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/panel/v1/fleet/assignments/:driverId", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    await clearDriverAssignment(req.params.driverId, ctx.claims.companyId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/panel/v1/fleet/vehicles/:id/documents",
  requirePanelAuth,
  express.raw({ type: "application/pdf", limit: "8mb" }),
  async (req, res, next) => {
    try {
      const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
      const buf = req.body as Buffer;
      if (!buf || buf.length < 8) {
        res.status(400).json({ error: "pdf_body_required" });
        return;
      }
      const id = req.params.id;
      const rel = path.join(ctx.claims.companyId, "vehicles", `${id}-${randomUUID()}.pdf`);
      const dest = path.join(FLEET_UPLOAD_ROOT, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      const storageKey = rel.replace(/\\/g, "/");
      const ar = await appendFleetVehicleDocument(id, ctx.claims.companyId, storageKey);
      if (!ar.ok) {
        const code = ar.error;
        res.status(code === "not_found" ? 404 : code === "documents_locked" ? 409 : 400).json({ error: code });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "fleet.vehicle_document_uploaded",
        subjectType: "fleet_vehicle",
        subjectId: id,
        meta: {},
      });
      res.json({ ok: true, storageKey });
    } catch (e) {
      next(e);
    }
  },
);

router.post("/panel/v1/fleet/vehicles/:id/submit-for-approval", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const sr = await submitFleetVehicleForApproval(req.params.id, ctx.claims.companyId);
    if (!sr.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        invalid_state: 409,
        konzession_number_required: 400,
        license_plate_required: 400,
        documents_required: 400,
      };
      res.status(m[sr.error] ?? 400).json({ error: sr.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "fleet.vehicle_submitted_for_approval",
      subjectType: "fleet_vehicle",
      subjectId: req.params.id,
      meta: {},
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fleet/vehicles/:id/documents/file", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.read")) return;
    const storageKey = typeof (req.query as { storageKey?: string }).storageKey === "string"
      ? (req.query as { storageKey: string }).storageKey.trim()
      : "";
    if (!storageKey || storageKey.includes("..")) {
      res.status(400).json({ error: "storage_key_invalid" });
      return;
    }
    const keys = await listFleetVehicleDocumentStorageKeysInCompany(ctx.claims.companyId, req.params.id);
    if (keys === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!keys.includes(storageKey)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const abs = path.resolve(path.join(FLEET_UPLOAD_ROOT, storageKey));
    const root = path.resolve(path.join(FLEET_UPLOAD_ROOT, ctx.claims.companyId));
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    createReadStream(abs)
      .on("error", () => {
        if (!res.headersSent) res.status(404).end();
      })
      .pipe(res);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/panel/v1/fleet/compliance/:kind",
  requirePanelAuth,
  express.raw({ type: "application/pdf", limit: "8mb" }),
  async (req, res, next) => {
    try {
      const ctx = await assertFleetPanel(req as PanelAuthRequest, res);
      if (!ctx) return;
      if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
      const kind = req.params.kind;
      if (kind !== "gewerbe" && kind !== "insurance") {
        res.status(400).json({ error: "invalid_kind" });
        return;
      }
      const buf = req.body as Buffer;
      if (!buf || buf.length < 8) {
        res.status(400).json({ error: "pdf_body_required" });
        return;
      }
      const rel = path.join(ctx.claims.companyId, "compliance", `${kind}-${randomUUID()}.pdf`);
      const dest = path.join(FLEET_UPLOAD_ROOT, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      const storageKey = rel.replace(/\\/g, "/");
      if (!isPostgresConfigured()) {
        res.status(503).json({ error: "database_not_configured" });
        return;
      }
      try {
        await insertComplianceDocumentUpload(
          ctx.claims.companyId,
          kind,
          storageKey,
          ctx.claims.panelUserId,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "database_not_configured") {
          res.status(503).json({ error: "database_not_configured" });
          return;
        }
        throw e;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: kind === "gewerbe" ? "fleet.compliance_gewerbe_uploaded" : "fleet.compliance_insurance_uploaded",
        subjectType: "admin_company",
        subjectId: ctx.claims.companyId,
        meta: {},
      });
      res.json({ ok: true, storageKey });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
