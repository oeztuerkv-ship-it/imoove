import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  getAdminHomepageAnalyticsDevices,
  getAdminHomepageAnalyticsPages,
  getAdminHomepageAnalyticsSources,
  getAdminHomepageAnalyticsSummary,
} from "../db/homepageAnalyticsData";
import { canAccessAdminHomepageAnalytics, type AdminRole } from "../lib/adminConsoleRoles";
import { parseHomepageAnalyticsRange } from "../lib/homepageAnalyticsPrivacy";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

router.get("/summary", async (req, res, next) => {
  try {
    if (!canAccessAdminHomepageAnalytics(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const range = parseHomepageAnalyticsRange(req.query.range);
    const summary = await getAdminHomepageAnalyticsSummary(range);
    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

router.get("/pages", async (req, res, next) => {
  try {
    if (!canAccessAdminHomepageAnalytics(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const range = parseHomepageAnalyticsRange(req.query.range);
    const items = await getAdminHomepageAnalyticsPages(range);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/sources", async (req, res, next) => {
  try {
    if (!canAccessAdminHomepageAnalytics(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const range = parseHomepageAnalyticsRange(req.query.range);
    const items = await getAdminHomepageAnalyticsSources(range);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/devices", async (req, res, next) => {
  try {
    if (!canAccessAdminHomepageAnalytics(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const range = parseHomepageAnalyticsRange(req.query.range);
    const data = await getAdminHomepageAnalyticsDevices(range);
    res.json({ ok: true, ...data });
  } catch (e) {
    next(e);
  }
});

export default router;
