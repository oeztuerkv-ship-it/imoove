import { Router, type IRouter } from "express";

/**
 * Admin-Dashboard-API unter /api/admin/… (und gespiegelt unter /admin/… wenn Nginx /api entfernt).
 * In-Memory-Stub — später durch DB/Firestore ersetzen.
 */

export interface CompanyRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  is_priority_company: boolean;
  priority_for_live_rides: boolean;
  priority_for_reservations: boolean;
  priority_price_threshold: number;
  priority_timeout_seconds: number;
  release_radius_km: number;
}

export interface FareAreaRow {
  id: string;
  name: string;
  ruleType: string;
  isRequiredArea: string;
  fixedPriceAllowed: string;
  status: string;
}

const router: IRouter = Router();

let companies: CompanyRow[] = [
  {
    id: "co-demo-1",
    name: "Demo Taxi GmbH",
    email: "demo@example.com",
    phone: "+49 711 000000",
    is_active: true,
    is_priority_company: true,
    priority_for_live_rides: true,
    priority_for_reservations: false,
    priority_price_threshold: 25,
    priority_timeout_seconds: 90,
    release_radius_km: 12,
  },
  {
    id: "co-demo-2",
    name: "Musterfahrdienst",
    email: "kontakt@muster.de",
    phone: "+49 711 111111",
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: 18,
    priority_timeout_seconds: 120,
    release_radius_km: 8,
  },
];

let fareAreas: FareAreaRow[] = [
  {
    id: "fa-1",
    name: "Stuttgart Zentrum",
    ruleType: "official_metered_tariff",
    isRequiredArea: "Ja",
    fixedPriceAllowed: "Prüfen",
    status: "aktiv",
  },
];

router.get("/admin/stats", (_req, res) => {
  res.json({
    ok: true,
    stats: {
      offene: 3,
      laufend: 1,
      erledigt: 42,
      unternehmer: companies.filter((c) => c.is_active).length,
      fahrer: 8,
      partner: 2,
    },
  });
});

router.get("/admin/companies", (_req, res) => {
  res.json({ ok: true, items: companies });
});

router.patch("/admin/companies/:companyId/priority", (req, res) => {
  const { companyId } = req.params;
  const body = req.body as Partial<{
    is_priority_company: boolean;
    priority_for_live_rides: boolean;
    priority_for_reservations: boolean;
  }>;
  const idx = companies.findIndex((c) => c.id === companyId);
  if (idx < 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const cur = companies[idx]!;
  const next: CompanyRow = {
    ...cur,
    ...(typeof body.is_priority_company === "boolean"
      ? { is_priority_company: body.is_priority_company }
      : {}),
    ...(typeof body.priority_for_live_rides === "boolean"
      ? { priority_for_live_rides: body.priority_for_live_rides }
      : {}),
    ...(typeof body.priority_for_reservations === "boolean"
      ? { priority_for_reservations: body.priority_for_reservations }
      : {}),
  };
  companies[idx] = next;
  res.json({ ok: true, item: next });
});

router.get("/admin/fare-areas", (_req, res) => {
  res.json({ ok: true, items: fareAreas });
});

router.post("/admin/fare-areas", (req, res) => {
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
  const row: FareAreaRow = {
    id: `fa-${Date.now()}`,
    name,
    ruleType: typeof body.ruleType === "string" ? body.ruleType : "official_metered_tariff",
    isRequiredArea: typeof body.isRequiredArea === "string" ? body.isRequiredArea : "Ja",
    fixedPriceAllowed: typeof body.fixedPriceAllowed === "string" ? body.fixedPriceAllowed : "Prüfen",
    status: typeof body.status === "string" ? body.status : "aktiv",
  };
  fareAreas = [...fareAreas, row];
  res.json({ ok: true, items: fareAreas });
});

export default router;
