import { Router, type IRouter, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { isPostgresConfigured } from "../db/client";
import { insertHomepageAnalyticsEvent } from "../db/homepageAnalyticsData";
import {
  coarseBrowserFromUserAgent,
  coarseDeviceTypeFromUserAgent,
  optionalCountryFromRequest,
  parseAnonymousVisitorId,
  parseHomepageAnalyticsEventType,
  sanitizeAnalyticsPagePath,
  sanitizeAnalyticsReferrer,
} from "../lib/homepageAnalyticsPrivacy";

const router: IRouter = Router();

const analyticsPostLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "too_many_requests" },
});

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
}

/**
 * POST /api/public/analytics/event
 * Öffentlich, ohne Auth — nur anonyme Marketing-Homepage-Events.
 * Keine IP-Speicherung; Visitor-ID nur zufällig vom Client.
 */
router.post("/public/analytics/event", analyticsPostLimit, async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }

    const b = parseBody(req);
    const eventType = parseHomepageAnalyticsEventType(b.eventType ?? b.event_type);
    if (!eventType) {
      res.status(400).json({ ok: false, error: "invalid_event_type" });
      return;
    }

    const anonymousVisitorId = parseAnonymousVisitorId(b.anonymousVisitorId ?? b.anonymous_visitor_id);
    if (!anonymousVisitorId) {
      res.status(400).json({ ok: false, error: "invalid_visitor_id" });
      return;
    }

    const pagePath = sanitizeAnalyticsPagePath(b.pagePath ?? b.page_path ?? "/");
    const referrer = sanitizeAnalyticsReferrer(b.referrer);
    const ua = req.get("user-agent") ?? undefined;

    const ok = await insertHomepageAnalyticsEvent({
      eventType,
      pagePath,
      referrer,
      deviceType: coarseDeviceTypeFromUserAgent(ua),
      browser: coarseBrowserFromUserAgent(ua),
      country: optionalCountryFromRequest(req),
      anonymousVisitorId,
    });

    if (!ok) {
      res.status(503).json({ ok: false, error: "persist_failed" });
      return;
    }

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
