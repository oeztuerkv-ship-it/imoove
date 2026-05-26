import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Gleiches Bild wie Mobile `IntroSplash` / `onroda-logo-official.png`. */
export const ONRODA_INVOICE_LOGO_FILENAME = "onroda-logo-official.png";

const LOGO_REL = path.join("assets", ONRODA_INVOICE_LOGO_FILENAME);

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

export function resolveOnrodaInvoiceLogoPath(): string | null {
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

  const mobileFallback = path.resolve(
    searchRoots()[0] ?? ".",
    "..",
    "mobile",
    "assets",
    "images",
    ONRODA_INVOICE_LOGO_FILENAME,
  );
  try {
    if (fs.existsSync(mobileFallback)) return mobileFallback;
  } catch {
    /* ignore */
  }
  return null;
}

/** PNG/JPEG-Buffer für PDFKit; `null` wenn Datei fehlt (Fallback: Text-Wordmark). */
export function getOnrodaInvoiceLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;
  const logoPath = resolveOnrodaInvoiceLogoPath();
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
