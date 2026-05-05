import { Router, type IRouter, type Request } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  createAppSponsorItem,
  deactivateAppSponsorItem,
  findAppSponsorAdmin,
  listAppSponsorsAdmin,
  parseAppSponsorAudience,
  parseAppSponsorCategory,
  patchAppSponsorItem,
} from "../db/appSponsorsData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
}

function isValidHttpsUrl(raw: string | null | undefined): boolean {
  const u = String(raw ?? "").trim();
  if (!u) return false;
  return /^https:\/\//i.test(u);
}

function qrCodeUrlFromExternalLink(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(url)}`;
}

router.get("/", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listAppSponsorsAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = parseBody(req);
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const description = typeof b.description === "string" ? b.description.trim() : "";
    if (!title || !description) {
      res.status(400).json({ error: "title_and_description_required" });
      return;
    }
    const externalUrlRaw = typeof b.externalUrl === "string" ? b.externalUrl : typeof b.external_url === "string" ? b.external_url : "";
    const externalUrl = externalUrlRaw.trim() || null;
    if (externalUrl && !isValidHttpsUrl(externalUrl)) {
      res.status(400).json({ error: "invalid_external_url" });
      return;
    }
    const qrFromLink = b.qrFromLink === true || b.qr_from_link === true;
    const qrRaw = typeof b.qrCodeUrl === "string" ? b.qrCodeUrl : typeof b.qr_code_url === "string" ? b.qr_code_url : "";
    const qrTrimmed = qrRaw.trim();
    const qrCodeUrl = qrFromLink && externalUrl ? qrCodeUrlFromExternalLink(externalUrl) : qrTrimmed || null;
    if (qrCodeUrl && !isValidHttpsUrl(qrCodeUrl)) {
      res.status(400).json({ error: "invalid_qr_code_url" });
      return;
    }
    const imageUrl = typeof b.imageUrl === "string" ? b.imageUrl.trim() || null : typeof b.image_url === "string" ? b.image_url.trim() || null : null;
    if (imageUrl && !isValidHttpsUrl(imageUrl)) {
      res.status(400).json({ error: "invalid_image_url" });
      return;
    }
    const logoUrl = typeof b.logoUrl === "string" ? b.logoUrl.trim() || null : typeof b.logo_url === "string" ? b.logo_url.trim() || null : null;
    if (logoUrl && !isValidHttpsUrl(logoUrl)) {
      res.status(400).json({ error: "invalid_logo_url" });
      return;
    }
    const buttonText = typeof b.buttonText === "string" ? b.buttonText.trim() || null : typeof b.button_text === "string" ? b.button_text.trim() || null : null;
    const category = parseAppSponsorCategory(typeof b.category === "string" ? b.category : undefined);
    const audience = parseAppSponsorAudience(typeof b.audience === "string" ? b.audience : undefined);
    const sortOrder = Number.isFinite(Number(b.sortOrder ?? b.sort_order)) ? Number(b.sortOrder ?? b.sort_order) : 0;
    const isActive = b.isActive === false || b.is_active === false ? false : true;
    const startsAt =
      typeof b.startsAt === "string" && b.startsAt.trim()
        ? new Date(b.startsAt)
        : typeof b.starts_at === "string" && b.starts_at.trim()
          ? new Date(b.starts_at)
          : null;
    const endsAt =
      typeof b.endsAt === "string" && b.endsAt.trim()
        ? new Date(b.endsAt)
        : typeof b.ends_at === "string" && b.ends_at.trim()
          ? new Date(b.ends_at)
          : null;
    if (startsAt && Number.isNaN(startsAt.getTime())) {
      res.status(400).json({ error: "invalid_starts_at" });
      return;
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      res.status(400).json({ error: "invalid_ends_at" });
      return;
    }
    const row = await createAppSponsorItem({
      title,
      description,
      imageUrl,
      logoUrl,
      externalUrl,
      buttonText,
      qrCodeUrl,
      qrFromLink,
      category,
      audience,
      sortOrder,
      isActive,
      startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
      endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    });
    if (!row) {
      res.status(500).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item: row });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const b = parseBody(req);
    const patch: Parameters<typeof patchAppSponsorItem>[1] = {};
    if (typeof b.title === "string") patch.title = b.title.trim();
    if (typeof b.description === "string") patch.description = b.description.trim();
    if (b.imageUrl !== undefined || b.image_url !== undefined) {
      const s = typeof b.imageUrl === "string" ? b.imageUrl : typeof b.image_url === "string" ? b.image_url : "";
      const v = s.trim() || null;
      if (v && !isValidHttpsUrl(v)) {
        res.status(400).json({ error: "invalid_image_url" });
        return;
      }
      patch.imageUrl = v;
    }
    if (b.logoUrl !== undefined || b.logo_url !== undefined) {
      const s = typeof b.logoUrl === "string" ? b.logoUrl : typeof b.logo_url === "string" ? b.logo_url : "";
      const v = s.trim() || null;
      if (v && !isValidHttpsUrl(v)) {
        res.status(400).json({ error: "invalid_logo_url" });
        return;
      }
      patch.logoUrl = v;
    }
    if (b.externalUrl !== undefined || b.external_url !== undefined) {
      const s = typeof b.externalUrl === "string" ? b.externalUrl : typeof b.external_url === "string" ? b.external_url : "";
      const v = s.trim() || null;
      if (v && !isValidHttpsUrl(v)) {
        res.status(400).json({ error: "invalid_external_url" });
        return;
      }
      patch.externalUrl = v;
    }
    if (b.buttonText !== undefined || b.button_text !== undefined) {
      const s = typeof b.buttonText === "string" ? b.buttonText : typeof b.button_text === "string" ? b.button_text : "";
      patch.buttonText = s.trim() || null;
    }
    if (typeof b.category === "string") patch.category = parseAppSponsorCategory(b.category);
    if (typeof b.audience === "string") patch.audience = parseAppSponsorAudience(b.audience);
    if (b.sortOrder !== undefined || b.sort_order !== undefined) patch.sortOrder = Number(b.sortOrder ?? b.sort_order) || 0;
    if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
    if (typeof b.is_active === "boolean") patch.isActive = b.is_active;
    if (b.startsAt !== undefined || b.starts_at !== undefined) {
      const raw = typeof b.startsAt === "string" ? b.startsAt : typeof b.starts_at === "string" ? b.starts_at : "";
      patch.startsAt = raw.trim() ? new Date(raw.trim()) : null;
    }
    if (b.endsAt !== undefined || b.ends_at !== undefined) {
      const raw = typeof b.endsAt === "string" ? b.endsAt : typeof b.ends_at === "string" ? b.ends_at : "";
      patch.endsAt = raw.trim() ? new Date(raw.trim()) : null;
    }
    const existing = await findAppSponsorAdmin(id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const effExternal = patch.externalUrl !== undefined ? patch.externalUrl : existing.externalUrl;
    const qrFromLink = b.qrFromLink === true || b.qr_from_link === true || (b.qrFromLink === false || b.qr_from_link === false ? false : existing.qrFromLink);
    patch.qrFromLink = qrFromLink;
    if (b.qrCodeUrl !== undefined || b.qr_code_url !== undefined) {
      const s = typeof b.qrCodeUrl === "string" ? b.qrCodeUrl : typeof b.qr_code_url === "string" ? b.qr_code_url : "";
      const v = s.trim() || null;
      if (v && !isValidHttpsUrl(v)) {
        res.status(400).json({ error: "invalid_qr_code_url" });
        return;
      }
      patch.qrCodeUrl = v;
    } else if (qrFromLink && effExternal) {
      patch.qrCodeUrl = qrCodeUrlFromExternalLink(effExternal);
    }
    const row = await patchAppSponsorItem(id, patch);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item: row });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const row = await deactivateAppSponsorItem(id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item: row });
  } catch (e) {
    next(e);
  }
});

export default router;
