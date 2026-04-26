import { Router, type IRouter } from "express";
import { getAppConfigForPublic } from "../db/appOperationalData";

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

export default router;
