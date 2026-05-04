import { Router, type IRouter } from "express";
import { getAppConfigForPublic } from "../db/appOperationalData";
import { listAppNewsPublic, parseAppNewsAudience } from "../db/appNewsData";

const router: IRouter = Router();

/**
 * Zentrale Lese-Konfiguration für Kunden- & Fahrer-App.
 * Kein Geheimnis — Steuerwerte, die sofort im UI gelten sollen.
 * Cache: kurz im CDN/Browser, Admin-Änderung wirksam nach Ablauf TTL bzw. nächster Fetch.
 */
router.get("/app/config", async (_req, res, next) => {
  try {
    const data = await getAppConfigForPublic();
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(data);
  } catch (e) {
    next(e);
  }
});

/** Öffentliche Neuigkeiten für Mobile (Kunden-App: `?audience=customer`, Default). */
router.get("/app/news", async (req, res, next) => {
  try {
    const q = typeof req.query.audience === "string" ? req.query.audience : "customer";
    const audience = parseAppNewsAudience(q);
    const rawLimit = req.query.limit;
    const limit =
      typeof rawLimit === "string" && /^\d+$/.test(rawLimit.trim())
        ? Math.min(20, Math.max(1, parseInt(rawLimit.trim(), 10)))
        : 5;
    const items = await listAppNewsPublic(audience, limit);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

export default router;
