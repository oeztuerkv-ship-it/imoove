import { Router, type IRouter } from "express";
import { z } from "zod";

const HealthCheckResponse = z.object({ status: z.literal("ok") });

const router: IRouter = Router();

const ok = () => HealthCheckResponse.parse({ status: "ok" });

router.get("/healthz", (_req, res) => {
  res.json(ok());
});

/** Alias für Clients, die /api/v1/health erwarten */
router.get("/v1/health", (_req, res) => {
  res.json(ok());
});

export default router;
