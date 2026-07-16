import { Router, type IRouter, type Request, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import { listActiveCancellationSuspensionsAdmin } from "../db/cancellationSuspensionsAdminData";
import { liftCustomerCancellationSuspension, SUSPENSION_REASON_AUTO } from "../db/customerCancellationSuspensionData";
import { liftFleetDriverCancellationSuspension } from "../db/fleetDriverCancellationSuspensionData";
import { findFleetDriverGlobal, setReservationSuspension } from "../db/fleetDriversData";
import { insertAdminAuthAuditLog } from "../db/adminAuthData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function adminUsername(req: Request): string {
  return req.adminAuth?.username?.trim() || "admin";
}

export function cancellationSuspensionReasonLabelDe(reason: string): string {
  const r = reason.trim();
  if (r === SUSPENSION_REASON_AUTO || r === "too_many_cancellations") {
    return "Zu viele Stornos (System)";
  }
  if (r === "too_many_post_accept_cancellations") {
    return "Zu viele Stornos nach Annahme (System)";
  }
  if (r === "admin_manual") {
    return "Manuell (Admin)";
  }
  if (r === "reservation_activation_or_late_cancel") {
    return "Vorbestellung: Aktivierung verpasst oder Spät-Storno (24h)";
  }
  return r || "—";
}

router.get("/", async (req: Request, res: Response, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const result = await listActiveCancellationSuspensionsAdmin({ q });
    res.json({
      ok: true,
      customers: result.customers.map((row) => ({
        ...row,
        reasonLabel: cancellationSuspensionReasonLabelDe(row.reason),
      })),
      drivers: result.drivers.map((row) => ({
        ...row,
        reasonLabel: cancellationSuspensionReasonLabelDe(row.reason),
      })),
      reservationSuspensions: result.reservationSuspensions.map((row) => ({
        ...row,
        reasonLabel: row.reasonLabel || cancellationSuspensionReasonLabelDe(row.reason),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    req.log?.error?.({ err: e, route: "admin.cancellation-suspensions.list" }, "cancellation_suspensions_list_failed");
    res.status(500).json({
      error: "cancellation_suspensions_list_failed",
      message: msg.slice(0, 300) || "Interner Fehler beim Laden der Storno-Sperren.",
    });
  }
});

router.post("/customers/:passengerId/lift", async (req: Request, res: Response, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const passengerId = String(req.params.passengerId ?? "").trim();
    if (!passengerId) {
      res.status(400).json({ error: "passenger_id_required" });
      return;
    }
    const ok = await liftCustomerCancellationSuspension(passengerId, adminUsername(req));
    if (!ok) {
      res.status(404).json({ error: "not_suspended", message: "Keine aktive Storno-Sperre für diesen Kunden." });
      return;
    }
    await insertAdminAuthAuditLog({
      username: adminUsername(req),
      action: "admin.customer.cancellation_suspension_lifted",
      meta: { passengerId, source: "cancellation-suspensions" },
    });
    res.json({ ok: true, passengerId });
  } catch (e) {
    next(e);
  }
});

router.post("/drivers/:fleetDriverId/lift", async (req: Request, res: Response, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const fleetDriverId = String(req.params.fleetDriverId ?? "").trim();
    if (!fleetDriverId) {
      res.status(400).json({ error: "fleet_driver_id_required" });
      return;
    }
    const ok = await liftFleetDriverCancellationSuspension(fleetDriverId, adminUsername(req));
    if (!ok) {
      res.status(404).json({ error: "not_suspended", message: "Keine aktive Storno-Sperre für diesen Fahrer." });
      return;
    }
    await insertAdminAuthAuditLog({
      username: adminUsername(req),
      action: "admin.fleet_driver.cancellation_suspension_lifted",
      meta: { fleetDriverId, source: "cancellation-suspensions" },
    });
    res.json({ ok: true, fleetDriverId });
  } catch (e) {
    next(e);
  }
});

/** 24h-Vorbestellungs-Sperre (`reservation_suspended_until`) manuell aufheben. */
router.post("/drivers/:fleetDriverId/lift-reservation", async (req: Request, res: Response, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const fleetDriverId = String(req.params.fleetDriverId ?? "").trim();
    if (!fleetDriverId) {
      res.status(400).json({ error: "fleet_driver_id_required" });
      return;
    }
    const row = await findFleetDriverGlobal(fleetDriverId);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const until = row.reservation_suspended_until;
    if (!until || new Date(until) <= new Date()) {
      res.status(404).json({
        error: "not_reservation_suspended",
        message: "Keine aktive Vorbestellungs-Sperre für diesen Fahrer.",
      });
      return;
    }
    const ok = await setReservationSuspension(fleetDriverId, row.company_id, null);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertAdminAuthAuditLog({
      username: adminUsername(req),
      action: "admin.fleet_driver.reservation_suspension_lifted",
      meta: { fleetDriverId, companyId: row.company_id, source: "cancellation-suspensions" },
    });
    res.json({ ok: true, fleetDriverId });
  } catch (e) {
    next(e);
  }
});

export default router;
