import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import { getHomepageContentPublic } from "../db/homepageContentData";
import { listHomepageFaqPublic, listHomepageHowPublic, listHomepageTrustPublic } from "../db/homepageModulesData";
import { listHomepagePlaceholdersPublic } from "../db/homepagePlaceholdersData";

const router: IRouter = Router();

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

export default router;
