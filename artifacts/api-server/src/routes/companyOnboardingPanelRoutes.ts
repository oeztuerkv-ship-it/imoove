import { Router, type IRouter } from "express";
import { insertPanelAuditLog } from "../db/panelAuditData";
import { randomUUID } from "node:crypto";
import {
  deleteCompanyOnboardingVehicle,
  getCompanyOnboardingBundle,
  getCompanyOnboardingDocumentFile,
  getCompanyOnboardingProfile,
  insertCompanyOnboardingDocument,
  insertCompanyOnboardingVehicle,
  listCompanyOnboardingDocuments,
  listCompanyOnboardingVehicles,
  patchCompanyOnboardingProfile,
  patchCompanyOnboardingVehicle,
  submitCompanyOnboardingForReview,
} from "../db/companyOnboardingData";
import { getCompanyKind } from "../db/fleetDriversData";
import { COMPANY_DOC_MAX_BYTES } from "../lib/companyOnboardingConstants";
import { parseMultipartForm } from "../lib/parseMultipartForm";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import { findActivePanelUserProfileById } from "../db/panelAuthData";
import { denyUnlessPanelModule } from "./panelRouteContext";
import type { PanelRole } from "../lib/panelJwt";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private, must-revalidate");
  next();
});

async function assertTaxiOnboardingPanel(req: PanelAuthRequest, res: import("express").Response) {
  const profile = await findActivePanelUserProfileById(req.panelAuth!.panelUserId);
  if (!profile) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  if (!denyUnlessPanelModule(res, profile, "company_profile")) return null;
  const kind = await getCompanyKind(req.panelAuth!.companyId);
  if (kind !== "taxi") {
    res.status(403).json({ error: "taxi_company_only" });
    return null;
  }
  return { claims: req.panelAuth!, profile };
}

function strBody(body: Record<string, unknown>, key: string): string | undefined {
  return typeof body[key] === "string" ? String(body[key]) : undefined;
}

router.get("/panel/v1/company-profile", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    const bundle = await getCompanyOnboardingBundle(ctx.claims.companyId);
    if (!bundle) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    res.json({ ok: true, ...bundle });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/company-profile", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "company.update")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await patchCompanyOnboardingProfile(ctx.claims.companyId, {
      name: strBody(b, "name"),
      contactName: strBody(b, "contactName"),
      email: strBody(b, "email"),
      phone: strBody(b, "phone"),
      addressLine1: strBody(b, "addressLine1"),
      addressLine2: strBody(b, "addressLine2"),
      postalCode: strBody(b, "postalCode"),
      city: strBody(b, "city"),
      country: strBody(b, "country"),
      iban: strBody(b, "iban"),
      taxNumber: strBody(b, "taxNumber"),
      tradeLicenseNumber: strBody(b, "tradeLicenseNumber"),
      concessionNumber: strBody(b, "concessionNumber"),
    });
    if (!r.ok) {
      const status = r.error === "not_found" ? 404 : r.error === "no_changes" ? 400 : 503;
      res.status(status).json({ error: r.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "onboarding.profile_updated",
      subjectType: "admin_company",
      subjectId: ctx.claims.companyId,
      meta: {},
    });
    res.json({ ok: true, profile: r.profile });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/company-profile/submit", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "company.update")) return;
    const r = await submitCompanyOnboardingForReview(ctx.claims.companyId);
    if (!r.ok) {
      const status =
        r.error === "not_found" ? 404 : r.error === "already_approved" ? 409 : 400;
      res.status(status).json({ error: r.error });
      return;
    }
    res.json({ ok: true, profile: r.profile });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/vehicles", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    const vehicles = await listCompanyOnboardingVehicles(ctx.claims.companyId);
    res.json({ ok: true, vehicles });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/vehicles", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await insertCompanyOnboardingVehicle(ctx.claims.companyId, {
      licensePlate: strBody(b, "licensePlate") ?? "",
      vehicleType: strBody(b, "vehicleType") ?? "",
      concessionNumber: strBody(b, "concessionNumber"),
      tuevDate: strBody(b, "tuevDate") ?? null,
      isActive: b.isActive !== false,
    });
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.status(201).json({ ok: true, vehicle: r.vehicle });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/vehicles/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await patchCompanyOnboardingVehicle(ctx.claims.companyId, req.params.id, {
      licensePlate: strBody(b, "licensePlate"),
      vehicleType: strBody(b, "vehicleType"),
      concessionNumber: strBody(b, "concessionNumber"),
      tuevDate: b.tuevDate === null ? null : strBody(b, "tuevDate"),
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined,
    });
    if (!r.ok) {
      res.status(r.error === "not_found" ? 404 : 400).json({ error: r.error });
      return;
    }
    res.json({ ok: true, vehicle: r.vehicle });
  } catch (e) {
    next(e);
  }
});

router.delete("/panel/v1/vehicles/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;
    const r = await deleteCompanyOnboardingVehicle(ctx.claims.companyId, req.params.id);
    if (!r.ok) {
      res.status(404).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/documents", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    const documents = await listCompanyOnboardingDocuments(ctx.claims.companyId);
    res.json({ ok: true, documents });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/documents", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role as PanelRole, "fleet.manage")) return;

    const parsed = await parseMultipartForm(req, { maxFileBytes: COMPANY_DOC_MAX_BYTES });
    const file = parsed.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const docType = parsed.fields.docType ?? parsed.fields.doc_type ?? "";
    const vehicleId = parsed.fields.vehicleId ?? parsed.fields.vehicle_id ?? "";

    const r = await insertCompanyOnboardingDocument(ctx.claims.companyId, {
      docType,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileData: file.buffer,
      vehicleId: vehicleId.trim() || null,
      uploadedBy: ctx.claims.panelUserId,
    });
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.status(201).json({ ok: true, document: r.document });
  } catch (e) {
    if (e instanceof Error && e.message === "file_too_large") {
      res.status(413).json({ error: "file_too_large" });
      return;
    }
    next(e);
  }
});

router.get("/panel/v1/documents/:id/file", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertTaxiOnboardingPanel(req as PanelAuthRequest, res);
    if (!ctx) return;
    const r = await getCompanyOnboardingDocumentFile(ctx.claims.companyId, req.params.id);
    if (!r.ok) {
      res.status(404).json({ error: r.error });
      return;
    }
    res.setHeader("Content-Type", r.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(r.fileName)}"`);
    res.send(r.buffer);
  } catch (e) {
    next(e);
  }
});

export default router;
