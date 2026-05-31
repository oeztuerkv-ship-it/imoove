import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";

export function adminFleetUploadRoot(): string {
  const fromEnv = (process.env.FLEET_UPLOAD_DIR ?? "").trim();
  if (fromEnv) return fromEnv;
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "fleet-uploads");
}

export function mimeFromStorageKey(storageKey: string, fallback = "application/octet-stream"): string {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

export function fileNameFromStorageKey(storageKey: string): string {
  const base = path.basename(storageKey.replace(/\\/g, "/"));
  return base || "dokument";
}

export function resolveAdminFleetUploadAbs(storageKey: string): string | null {
  const key = storageKey.trim();
  if (!key || key.includes("..")) return null;
  const root = path.resolve(adminFleetUploadRoot());
  const abs = path.resolve(path.join(root, key));
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

export async function readAdminFleetUploadBuffer(
  storageKey: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const abs = resolveAdminFleetUploadAbs(storageKey);
  if (!abs) return null;
  try {
    const buffer = await fs.readFile(abs);
    return {
      buffer,
      mimeType: mimeFromStorageKey(storageKey),
      fileName: fileNameFromStorageKey(storageKey),
    };
  } catch {
    return null;
  }
}

export function streamAdminFleetUploadToResponse(
  storageKey: string,
  res: Response,
  opts?: { downloadName?: string },
): boolean {
  const abs = resolveAdminFleetUploadAbs(storageKey);
  if (!abs) return false;
  const mime = mimeFromStorageKey(storageKey);
  const name = opts?.downloadName?.trim() || fileNameFromStorageKey(storageKey);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
  createReadStream(abs)
    .on("error", () => {
      if (!res.headersSent) res.status(404).end();
    })
    .pipe(res);
  return true;
}
