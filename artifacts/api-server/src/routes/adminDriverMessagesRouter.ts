import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  fleetDriverExists,
  insertDriverMessage,
  listDriverMessagesAdmin,
} from "../db/driverMessagesData";
import {
  listAllFleetDriverExpoPushTokens,
  listFleetDriverExpoPushTokens,
} from "../db/fleetDriverExpoPushData";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import { sendExpoPushMessages } from "../lib/expoPushGateway";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function sentByLabel(req: Request): string {
  return (req.adminAuth?.username ?? "admin").trim() || "admin";
}

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
}

router.get("/", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const rawLimit = req.query.limit;
    const limit =
      typeof rawLimit === "string" && /^\d+$/.test(rawLimit.trim())
        ? parseInt(rawLimit.trim(), 10)
        : 100;
    const items = await listDriverMessagesAdmin(limit);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.post("/broadcast", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = parseBody(req);
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!title || !body) {
      res.status(400).json({ error: "title_body_required" });
      return;
    }
    const item = await insertDriverMessage({
      title,
      body,
      targetDriverId: null,
      sentBy: sentByLabel(req),
    });
    if (!item) {
      res.status(500).json({ error: "create_failed" });
      return;
    }
    const tokenRows = await listAllFleetDriverExpoPushTokens();
    const messages = tokenRows.map((r) => ({
      to: r.token,
      title,
      body,
      data: { type: "driver_admin_message", messageId: item.id, broadcast: true },
    }));
    await sendExpoPushMessages(messages);
    res.status(201).json({
      ok: true,
      item,
      push: { attempted: messages.length, uniqueDrivers: new Set(tokenRows.map((r) => r.fleetDriverId)).size },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/single", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = parseBody(req);
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const body = typeof b.body === "string" ? b.body.trim() : "";
    const driverId =
      typeof b.driverId === "string"
        ? b.driverId.trim()
        : typeof b.targetDriverId === "string"
          ? b.targetDriverId.trim()
          : typeof b.target_driver_id === "string"
            ? b.target_driver_id.trim()
            : "";
    const companyId =
      typeof b.companyId === "string"
        ? b.companyId.trim()
        : typeof b.company_id === "string"
          ? b.company_id.trim()
          : "";
    if (!title || !body) {
      res.status(400).json({ error: "title_body_required" });
      return;
    }
    if (!driverId) {
      res.status(400).json({ error: "driver_id_required" });
      return;
    }
    let resolvedCompanyId = companyId;
    if (resolvedCompanyId) {
      const row = await findFleetDriverInCompany(driverId, resolvedCompanyId);
      if (!row) {
        res.status(404).json({ error: "driver_not_found" });
        return;
      }
    } else {
      const exists = await fleetDriverExists(driverId);
      if (!exists) {
        res.status(404).json({ error: "driver_not_found" });
        return;
      }
    }
    const item = await insertDriverMessage({
      title,
      body,
      targetDriverId: driverId,
      sentBy: sentByLabel(req),
    });
    if (!item) {
      res.status(500).json({ error: "create_failed" });
      return;
    }
    let tokens: string[] = [];
    if (resolvedCompanyId) {
      tokens = await listFleetDriverExpoPushTokens(driverId, resolvedCompanyId);
    } else {
      const all = await listAllFleetDriverExpoPushTokens();
      tokens = all.filter((r) => r.fleetDriverId === driverId).map((r) => r.token);
    }
    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      data: { type: "driver_admin_message", messageId: item.id, broadcast: false },
    }));
    await sendExpoPushMessages(messages);
    res.status(201).json({ ok: true, item, push: { attempted: messages.length } });
  } catch (e) {
    next(e);
  }
});

export default router;
