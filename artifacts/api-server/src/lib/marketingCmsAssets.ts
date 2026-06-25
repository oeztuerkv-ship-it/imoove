import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CMS_ASSETS_ROOT =
  (process.env.MARKETING_CMS_ASSETS_DIR ?? "").trim() || path.join(pkgRoot, "marketing-site", "cms-assets");

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 3 * 1024 * 1024;

export function isAllowedMarketingAssetUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith("/")) return !u.includes("..");
  return /^https:\/\//i.test(u);
}

export async function saveMarketingCmsAsset(
  buffer: Buffer,
  mimeType: string,
  originalFileName: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ct = mimeType.split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME.has(ct)) {
    return { ok: false, error: "unsupported_content_type" };
  }
  if (!buffer.length || buffer.length > MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  const ext =
    ct === "image/png"
      ? "png"
      : ct === "image/jpeg"
        ? "jpg"
        : ct === "image/webp"
          ? "webp"
          : ct === "image/gif"
            ? "gif"
            : "svg";
  const safeBase = originalFileName.replace(/[^\w.\-]+/g, "-").slice(0, 80) || "upload";
  const fileName = `${randomUUID()}-${safeBase.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
  const dest = path.join(CMS_ASSETS_ROOT, fileName);
  await fs.mkdir(CMS_ASSETS_ROOT, { recursive: true });
  await fs.writeFile(dest, buffer);
  return { ok: true, url: `/cms-assets/${fileName}` };
}
