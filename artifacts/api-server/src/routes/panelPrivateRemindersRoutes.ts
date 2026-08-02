import { Router, type IRouter } from "express";
import {
  createPartnerPrivateReminder,
  deletePartnerPrivateReminder,
  listPartnerPrivateRemindersForPanel,
  updatePartnerPrivateReminder,
} from "../db/partnerPrivateRemindersData";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import { assertActivePanelProfile, denyUnlessPanelModule } from "./panelRouteContext";

const router: IRouter = Router();

function denyUnlessTaxiOwnerOrManager(
  res: import("express").Response,
  profile: { companyKind: string; role: string },
): boolean {
  if (String(profile.companyKind ?? "").trim().toLowerCase() !== "taxi") {
    res.status(403).json({ error: "taxi_only" });
    return false;
  }
  const role = String(profile.role ?? "").trim().toLowerCase();
  if (role !== "owner" && role !== "manager") {
    res.status(403).json({ error: "owner_or_manager_required" });
    return false;
  }
  return true;
}

router.get("/panel/v1/private-reminders", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_list")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    if (!denyUnlessTaxiOwnerOrManager(res, ctx.profile)) return;
    const reminders = await listPartnerPrivateRemindersForPanel(ctx.claims.companyId);
    res.json({ ok: true, reminders });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/private-reminders", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_list")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;
    if (!denyUnlessTaxiOwnerOrManager(res, ctx.profile)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out = await createPartnerPrivateReminder({
      companyId: ctx.claims.companyId,
      panelUserId: ctx.claims.panelUserId,
      fleetDriverId: null,
      scheduledAt: body.scheduledAt,
      fromFull: body.fromFull,
      toFull: body.toFull,
      note: body.note,
    });
    if (!out.ok) {
      res.status(400).json({ error: out.error });
      return;
    }
    res.status(201).json({ ok: true, reminder: out.reminder });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/private-reminders/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_list")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;
    if (!denyUnlessTaxiOwnerOrManager(res, ctx.profile)) return;
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out = await updatePartnerPrivateReminder({
      companyId: ctx.claims.companyId,
      reminderId: id,
      fleetDriverId: null,
      scheduledAt: body.scheduledAt,
      fromFull: body.fromFull,
      toFull: body.toFull,
      note: body.note,
    });
    if (!out.ok) {
      res.status(out.error === "not_found" ? 404 : 400).json({ error: out.error });
      return;
    }
    res.json({ ok: true, reminder: out.reminder });
  } catch (e) {
    next(e);
  }
});

router.delete("/panel/v1/private-reminders/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_list")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;
    if (!denyUnlessTaxiOwnerOrManager(res, ctx.profile)) return;
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const out = await deletePartnerPrivateReminder(ctx.claims.companyId, id, null);
    if (!out.ok) {
      res.status(out.error === "not_found" ? 404 : 400).json({ error: out.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
