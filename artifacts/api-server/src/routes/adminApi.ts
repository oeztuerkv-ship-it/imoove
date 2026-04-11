import { Router, type IRouter } from "express";
import {
  addFareArea,
  getAdminStats,
  listCompanies,
  listFareAreas,
  patchCompanyPriority,
} from "../db/adminData";

export type { CompanyRow, FareAreaRow } from "./adminApi.types";

const router: IRouter = Router();

router.get("/admin/stats", async (_req, res, next) => {
  try {
    const stats = await getAdminStats();
    res.json({ ok: true, stats });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/companies", async (_req, res, next) => {
  try {
    const items = await listCompanies();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/companies/:companyId/priority", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const body = req.body as Partial<{
      is_priority_company: boolean;
      priority_for_live_rides: boolean;
      priority_for_reservations: boolean;
    }>;
    const item = await patchCompanyPriority(companyId, body);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/fare-areas", async (_req, res, next) => {
  try {
    const items = await listFareAreas();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/fare-areas", async (req, res, next) => {
  try {
    const body = req.body as Partial<{
      name: string;
      ruleType: string;
      isRequiredArea: string;
      fixedPriceAllowed: string;
      status: string;
    }>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    const items = await addFareArea({
      name,
      ruleType: typeof body.ruleType === "string" ? body.ruleType : "official_metered_tariff",
      isRequiredArea: typeof body.isRequiredArea === "string" ? body.isRequiredArea : "Ja",
      fixedPriceAllowed: typeof body.fixedPriceAllowed === "string" ? body.fixedPriceAllowed : "Prüfen",
      status: typeof body.status === "string" ? body.status : "aktiv",
    });
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

export default router;
