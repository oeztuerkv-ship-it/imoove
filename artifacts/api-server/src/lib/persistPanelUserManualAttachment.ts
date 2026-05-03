import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 6 * 1024 * 1024;

function uploadsRoot(): string {
  const fromEnv = (process.env.PANEL_USER_MANUAL_UPLOAD_DIR ?? "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "artifacts/api-server/uploads/panel-user-manual");
}

/**
 * Speichert einen optionalen Nachweis zur manuellen Partner-Zugangs-Anlage (nur Dateisystem + Audit-Meta).
 */
export async function persistPanelUserManualAttachment(input: {
  companyId: string;
  panelUserId: string;
  originalFileName: string;
  contentBase64: string;
}): Promise<{ ok: true; relPath: string; sizeBytes: number } | { ok: false; reason: string }> {
  const safeName = input.originalFileName
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120) || "document.bin";
  const ext = path.extname(safeName) || ".bin";
  const cleaned = input.contentBase64.includes(",")
    ? input.contentBase64.split(",").pop() ?? ""
    : input.contentBase64;
  let buf: Buffer;
  try {
    buf = Buffer.from(cleaned, "base64");
  } catch {
    return { ok: false, reason: "invalid_base64" };
  }
  if (buf.byteLength === 0) {
    return { ok: false, reason: "empty_file" };
  }
  if (buf.byteLength > MAX_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  const base = uploadsRoot();
  const dir = path.join(base, input.companyId, input.panelUserId);
  await mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const absPath = path.join(dir, fileName);
  const baseR = path.resolve(base);
  const resolved = path.resolve(absPath);
  if (!resolved.startsWith(baseR + path.sep)) {
    return { ok: false, reason: "invalid_path" };
  }
  const relPath = path.relative(baseR, resolved);
  await writeFile(resolved, buf);
  return { ok: true, relPath, sizeBytes: buf.byteLength };
}
