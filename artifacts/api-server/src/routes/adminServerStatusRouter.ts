import { Router } from "express";
import { collectServerStatusSnapshot } from "../lib/netdataServerStatus";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";

const router = Router();

/** GET /admin/server-status — Netdata-Metriken + PM2-Prozesse (nur Plattform-Admin). */
router.get("/admin/server-status", requireAdminApiBearer, async (_req, res, next) => {
  try {
    const status = await collectServerStatusSnapshot();
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

export default router;
