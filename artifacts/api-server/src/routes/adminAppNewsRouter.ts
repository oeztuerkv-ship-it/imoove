import { Router, type IRouter, type Request, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  createAppNewsItem,
  deactivateAppNewsItem,
  findAppNewsAdmin,
  listAppNewsAdmin,
  parseAppNewsAudience,
  parseAppNewsTargetType,
  patchAppNewsItem,
  type AppNewsAudience,
} from "../db/appNewsData";
import { canMutateAdminCompanies, type AdminRole } from "../lib/adminConsoleRoles";

const router: IRouter = Router();

function adminRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

const INTERNAL_PATH_RE =
  /^\/(help|wallet|my-rides|profile|booking-center|status|ride-detail|personal-info|google-auth|login-success)(\/|$)/;

function isValidInternalPath(raw: string | null | undefined): boolean {
  const p = String(raw ?? "").trim();
  if (!p.startsWith("/") || p.includes("..")) return false;
  return INTERNAL_PATH_RE.test(p);
}

function isValidExternalUrl(raw: string | null | undefined): boolean {
  const u = String(raw ?? "").trim();
  if (!u) return false;
  if (u.startsWith("https://")) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u)) return true;
  return false;
}

function parseBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
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
    const items = await listAppNewsAdmin();
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
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!title || !body) {
      res.status(400).json({ error: "title_and_body_required" });
      return;
    }
    const targetType = parseAppNewsTargetType(typeof b.targetType === "string" ? b.targetType : b.target_type);
    const targetValueRaw =
      typeof b.targetValue === "string" ? b.targetValue : typeof b.target_value === "string" ? b.target_value : "";
    const targetValue = targetValueRaw.trim() || null;
    if (targetType === "internal_screen" && !isValidInternalPath(targetValue)) {
      res.status(400).json({ error: "invalid_internal_path" });
      return;
    }
    if (targetType === "external_url" && !isValidExternalUrl(targetValue)) {
      res.status(400).json({ error: "invalid_external_url" });
      return;
    }
    const audience = parseAppNewsAudience(typeof b.audience === "string" ? b.audience : undefined);
    const sortOrder = Number.isFinite(Number(b.sortOrder ?? b.sort_order)) ? Number(b.sortOrder ?? b.sort_order) : 0;
    const isActive = b.isActive === false || b.is_active === false ? false : true;
    const imageUrl =
      typeof b.imageUrl === "string" ? b.imageUrl.trim() || null : typeof b.image_url === "string" ? b.image_url.trim() || null : null;
    const buttonText =
      typeof b.buttonText === "string"
        ? b.buttonText.trim() || null
        : typeof b.button_text === "string"
          ? b.button_text.trim() || null
          : null;
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
    const row = await createAppNewsItem({
      title,
      body,
      imageUrl,
      buttonText,
      targetType,
      targetValue,
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
    const patch: Parameters<typeof patchAppNewsItem>[1] = {};
    if (typeof b.title === "string") patch.title = b.title.trim();
    if (typeof b.body === "string") patch.body = b.body.trim();
    if (b.imageUrl !== undefined || b.image_url !== undefined) {
      const s = typeof b.imageUrl === "string" ? b.imageUrl : typeof b.image_url === "string" ? b.image_url : "";
      patch.imageUrl = s.trim() || null;
    }
    if (b.buttonText !== undefined || b.button_text !== undefined) {
      const s = typeof b.buttonText === "string" ? b.buttonText : typeof b.button_text === "string" ? b.button_text : "";
      patch.buttonText = s.trim() || null;
    }
    if (typeof b.targetType === "string" || typeof b.target_type === "string") {
      patch.targetType = parseAppNewsTargetType(typeof b.targetType === "string" ? b.targetType : String(b.target_type));
    }
    if (b.targetValue !== undefined || b.target_value !== undefined) {
      const s =
        typeof b.targetValue === "string" ? b.targetValue : typeof b.target_value === "string" ? b.target_value : "";
      patch.targetValue = s.trim() || null;
    }
    if (typeof b.audience === "string") patch.audience = parseAppNewsAudience(b.audience) as AppNewsAudience;
    if (b.sortOrder !== undefined || b.sort_order !== undefined) {
      patch.sortOrder = Number(b.sortOrder ?? b.sort_order) || 0;
    }
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
    const existing = await findAppNewsAdmin(id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const effType = patch.targetType ?? existing.targetType;
    const effValue = patch.targetValue !== undefined ? patch.targetValue : existing.targetValue;
    if (effType === "internal_screen" && !isValidInternalPath(effValue ?? "")) {
      res.status(400).json({ error: "invalid_internal_path" });
      return;
    }
    if (effType === "external_url" && effValue && !isValidExternalUrl(effValue)) {
      res.status(400).json({ error: "invalid_external_url" });
      return;
    }
    const row = await patchAppNewsItem(id, patch);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item: row });
  } catch (e) {
    next(e);
  }
});

/** Deaktivieren (Soft-Delete). */
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
    const row = await deactivateAppNewsItem(id);
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
