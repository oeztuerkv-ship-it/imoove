import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Einziges Produkt-Logo (Partner-Panel `OnrodaMark`, Mobile-Partner-Header). */
export const ONRODA_BRAND_LOGO_FILENAME = "onroda-logo-transparent.png";

const LOGO_REL = path.join("assets", ONRODA_BRAND_LOGO_FILENAME);

let cachedLogoBuffer: Buffer | null | undefined;

function searchRoots(): string[] {
  const roots: string[] = [];
  if (typeof globalThis.__dirname === "string") roots.push(globalThis.__dirname);
  try {
    roots.push(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* ignore */
  }
  return roots;
}

export function resolveOnrodaBrandLogoPath(): string | null {
  for (const start of searchRoots()) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = path.join(dir, LOGO_REL);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        /* ignore */
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  for (const rel of [
    path.join("partner-panel", "src", "assets", ONRODA_BRAND_LOGO_FILENAME),
    path.join("mobile", "assets", "images", ONRODA_BRAND_LOGO_FILENAME),
  ]) {
    const fallback = path.resolve(searchRoots()[0] ?? ".", "..", rel);
    try {
      if (fs.existsSync(fallback)) return fallback;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function getOnrodaBrandLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;
  const logoPath = resolveOnrodaBrandLogoPath();
  if (!logoPath) {
    cachedLogoBuffer = null;
    return null;
  }
  try {
    cachedLogoBuffer = fs.readFileSync(logoPath);
  } catch {
    cachedLogoBuffer = null;
  }
  return cachedLogoBuffer;
}

/** Inline-PNG für HTML-Mails (kein externes `onroda-mark.png`). */
export function onrodaBrandLogoDataUri(): string | null {
  const buf = getOnrodaBrandLogoBuffer();
  if (!buf?.length) return null;
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function onrodaBrandLogoMailImgHtml(options?: {
  width?: number;
  height?: number;
  centered?: boolean;
}): string {
  const src = onrodaBrandLogoDataUri();
  if (!src) return "";
  const w = options?.width ?? 160;
  const h = options?.height ?? 60;
  const wrap = options?.centered
    ? ' style="text-align:center;margin:0 0 20px"'
    : ' style="margin:0 0 16px"';
  return `<div${wrap}><img src="${src}" alt="ONRODA" width="${w}" height="${h}" style="display:block;${options?.centered ? "margin:0 auto;" : ""}max-width:100%;height:auto;border:0" /></div>`;
}
