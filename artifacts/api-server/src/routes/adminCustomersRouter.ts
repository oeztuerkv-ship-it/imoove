import { Router, type IRouter, type Request, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  adminSuspendCustomerCancellation,
  liftCustomerCancellationSuspension,
} from "../db/customerCancellationSuspensionData";
import { listCustomersAdmin, listCustomersAdminForExport } from "../db/customersAdminData";
import { insertAdminAuthAuditLog } from "../db/adminAuthData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function adminUsername(req: Request): string {
  return req.adminAuth?.username?.trim() || "admin";
}

function csvEscape(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function customersToCsv(rows: Awaited<ReturnType<typeof listCustomersAdminForExport>>): string {
  const header = [
    "Name",
    "E-Mail",
    "Anmeldung",
    "Passenger-ID",
    "Registriert",
    "Fahrten",
    "Stornos",
    "Gesperrt",
    "Gesperrt bis",
    "Sperrgrund",
  ].join(";");
  const authLabel = (p: string) => (p === "email" ? "E-Mail" : p === "apple" ? "Apple" : "Google");
  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.email),
      authLabel(r.authProvider),
      csvEscape(r.passengerId),
      csvEscape(r.registeredAt),
      String(r.rideCount),
      String(r.cancellationCount),
      r.isSuspended ? "ja" : "nein",
      csvEscape(r.suspendedUntil ?? ""),
      csvEscape(r.suspensionReason ?? ""),
    ].join(";"),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
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
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const result = await listCustomersAdmin({
      q,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.get("/export", async (req: Request, res: Response, next) => {
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
    const rows = await listCustomersAdminForExport(q);
    const csv = customersToCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="onroda-kunden.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.post("/:passengerId/suspend", async (req: Request, res: Response, next) => {
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
    const body = (req.body ?? {}) as { hours?: unknown };
    const hoursRaw = Number(body.hours);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 24;
    const row = await adminSuspendCustomerCancellation({
      passengerId,
      hours,
      adminUsername: adminUsername(req),
    });
    await insertAdminAuthAuditLog({
      username: adminUsername(req),
      action: "admin.customer.suspended",
      meta: { passengerId, hours, suspendedUntil: row.suspendedUntil.toISOString() },
    });
    res.json({
      ok: true,
      passengerId: row.passengerId,
      suspendedUntil: row.suspendedUntil.toISOString(),
      reason: row.reason,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/:passengerId/lift-suspension", async (req: Request, res: Response, next) => {
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
      res.status(404).json({ error: "not_suspended", message: "Keine aktive Sperre für diesen Kunden." });
      return;
    }
    await insertAdminAuthAuditLog({
      username: adminUsername(req),
      action: "admin.customer.suspension_lifted",
      meta: { passengerId },
    });
    res.json({ ok: true, passengerId });
  } catch (e) {
    next(e);
  }
});

export default router;
