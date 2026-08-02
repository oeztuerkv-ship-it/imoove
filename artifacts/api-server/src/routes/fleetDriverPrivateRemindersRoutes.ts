import { Router, type IRouter, type Response } from "express";
import { findCompanyById } from "../db/adminData";
import { isPostgresConfigured } from "../db/client";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import {
  createPartnerPrivateReminder,
  deletePartnerPrivateReminder,
  listPartnerPrivateRemindersForFleetDriver,
  updatePartnerPrivateReminder,
} from "../db/partnerPrivateRemindersData";
import { requireFleetDriverAuth, type FleetDriverAuthRequest } from "../middleware/requireFleetDriverAuth";

const router: IRouter = Router();

/**
 * Private Merkliste pro Fahrer — gleiche Tabelle wie Panel.
 * Gate: Taxi-Mandant + aktiver Fleet-Fahrer; Scope nur eigene `fleet_driver_id`.
 */
async function denyUnlessTaxiFleetDriver(
  res: Response,
  fleetDriverId: string,
  companyId: string,
): Promise<boolean> {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return false;
  }
  const company = await findCompanyById(companyId);
  if (String(company?.company_kind ?? "").trim().toLowerCase() !== "taxi") {
    res.status(403).json({ error: "taxi_only" });
    return false;
  }
  const row = await findFleetDriverInCompany(fleetDriverId, companyId);
  if (!row) {
    res.status(401).json({ error: "not_found" });
    return false;
  }
  return true;
}

router.get("/fleet-driver/v1/private-reminders", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!(await denyUnlessTaxiFleetDriver(res, a.fleetDriverId, a.companyId))) return;
    const reminders = await listPartnerPrivateRemindersForFleetDriver(a.companyId, a.fleetDriverId);
    res.json({ ok: true, reminders });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/private-reminders", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!(await denyUnlessTaxiFleetDriver(res, a.fleetDriverId, a.companyId))) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out = await createPartnerPrivateReminder({
      companyId: a.companyId,
      panelUserId: null,
      fleetDriverId: a.fleetDriverId,
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

router.patch("/fleet-driver/v1/private-reminders/:id", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!(await denyUnlessTaxiFleetDriver(res, a.fleetDriverId, a.companyId))) return;
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out = await updatePartnerPrivateReminder({
      companyId: a.companyId,
      reminderId: id,
      fleetDriverId: a.fleetDriverId,
      scheduledAt: body.scheduledAt,
      fromFull: body.fromFull,
      toFull: body.toFull,
      note: body.note,
      completed: body.completed,
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

router.delete("/fleet-driver/v1/private-reminders/:id", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!(await denyUnlessTaxiFleetDriver(res, a.fleetDriverId, a.companyId))) return;
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const out = await deletePartnerPrivateReminder(a.companyId, id, a.fleetDriverId);
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
