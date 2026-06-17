import { Router, type IRouter } from "express";
import { buildHealthCheckPayload } from "../lib/deployRevision";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json(buildHealthCheckPayload());
});

/** Alias für Nginx/Ingress, die oft `GET /health` oder `GET /api/health` prüfen */
router.get("/health", (_req, res) => {
  res.json(buildHealthCheckPayload());
});

/** Alias für Clients, die /api/v1/health erwarten */
router.get("/v1/health", (_req, res) => {
  res.json(buildHealthCheckPayload());
});

export default router;
