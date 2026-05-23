import { Router, type IRouter, type Request, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import { listCustomerAccountsAdmin } from "../db/customerAccountsData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
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
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 500;
    const items = await listCustomerAccountsAdmin(limit);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

export default router;
