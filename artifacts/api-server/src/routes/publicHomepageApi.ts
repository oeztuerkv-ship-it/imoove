import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import { getOperationalConfigPayload, listServiceRegionsForApi } from "../db/appOperationalData";
import { getHomepageContentPublic } from "../db/homepageContentData";
import { listHomepageFaqPublic, listHomepageHowPublic, listHomepageTrustPublic } from "../db/homepageModulesData";
import { listHomepagePlaceholdersPublic } from "../db/homepagePlaceholdersData";
import { getLegalPagePublic, getLegalConsentVersions, isLegalPageSlug } from "../db/legalPagesData";
import { buildFixedPriceQuote, buildRouteDistanceQuote } from "../lib/fixedPriceRouteQuote";

const router: IRouter = Router();

function optCoord(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseVehicleQuery(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "standard";
  if (v === "xl" || v === "wheelchair" || v === "standard") return v;
  if (v.includes("rollstuhl")) return "wheelchair";
  if (v.includes("xl") || v.includes("großraum")) return "xl";
  return "standard";
}

router.get("/public/homepage-placeholders", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, items: [] });
      return;
    }
    const items = await listHomepagePlaceholdersPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

// Alias für konsistente Benennung im Frontend/QA.
router.get("/public/homepage-hints", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, items: [] });
      return;
    }
    const items = await listHomepagePlaceholdersPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/public/homepage-content", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, item: null });
      return;
    }
    const item = await getHomepageContentPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

router.get("/public/homepage-faq", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, items: [] });
      return;
    }
    const items = await listHomepageFaqPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/public/homepage-how", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, items: [] });
      return;
    }
    const items = await listHomepageHowPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/public/homepage-trust", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.json({ ok: true, items: [] });
      return;
    }
    const items = await listHomepageTrustPublic();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

/** Streckenlänge für Mobile/Kunden (Google primär, OSRM Fallback — kein Haversine für Preis-km). */
router.get("/public/route-distance", async (req, res, next) => {
  try {
    const result = await buildRouteDistanceQuote({
      fromFull: String(req.query.fromFull ?? req.query.from ?? ""),
      toFull: String(req.query.toFull ?? req.query.to ?? ""),
      fromLat: optCoord(req.query.fromLat ?? req.query.from_lat),
      fromLon: optCoord(req.query.fromLon ?? req.query.from_lon),
      toLat: optCoord(req.query.toLat ?? req.query.to_lat),
      toLon: optCoord(req.query.toLon ?? req.query.to_lon),
      fromCity: typeof req.query.fromCity === "string" ? req.query.fromCity : null,
      toCity: typeof req.query.toCity === "string" ? req.query.toCity : null,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      distanceKm: result.route.distanceKm,
      durationMinutes: result.route.durationMinutes,
      routingSource: result.routingSource,
      from: result.from,
      to: result.to,
    });
  } catch (e) {
    next(e);
  }
});

/** Festpreis-Rechner (Marketing /fixpreise) — gleiche Logik wie App, Tarife aus Admin-Betrieb. */
router.get("/public/fixed-price-quote", async (req, res, next) => {
  try {
    const result = await buildFixedPriceQuote({
      fromFull: String(req.query.fromFull ?? req.query.from ?? ""),
      toFull: String(req.query.toFull ?? req.query.to ?? ""),
      fromLat: optCoord(req.query.fromLat ?? req.query.from_lat),
      fromLon: optCoord(req.query.fromLon ?? req.query.from_lon),
      toLat: optCoord(req.query.toLat ?? req.query.to_lat),
      toLon: optCoord(req.query.toLon ?? req.query.to_lon),
      fromCity: typeof req.query.fromCity === "string" ? req.query.fromCity : null,
      toCity: typeof req.query.toCity === "string" ? req.query.toCity : null,
      vehicle: parseVehicleQuery(req.query.vehicle),
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** Kunden-App: zentrale Betriebs-Regeln + Einfahrt-Gebiete (ohne Login, kurz cachen). */
router.get("/public/app-operational", async (_req, res, next) => {
  try {
    const [config, serviceRegions] = await Promise.all([
      getOperationalConfigPayload(),
      listServiceRegionsForApi(),
    ]);
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json({ ok: true, config, serviceRegions });
  } catch (e) {
    next(e);
  }
});

router.get("/public/legal-pages/consent-versions", async (_req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const versions = await getLegalConsentVersions();
    if (!versions) {
      res.status(503).json({ ok: false, error: "legal_versions_unavailable" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ok: true, versions });
  } catch (e) {
    next(e);
  }
});

router.get("/public/legal-pages/:slug", async (req, res, next) => {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    if (!isLegalPageSlug(slug)) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const item = await getLegalPagePublic(slug);
    if (!item) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

export default router;
