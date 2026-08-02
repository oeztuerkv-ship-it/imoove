/**
 * Fleet-Fahrer-Avatar: Datei unter fleet-uploads + öffentliche URL (nur mit Consent).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Request } from "express";

import { adminFleetUploadRoot, resolveAdminFleetUploadAbs } from "./adminFleetUploadFile";
import { decodeValidatedMedicalTransportImage } from "./medicalTransportImage";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function fleetDriverAvatarStorageKey(companyId: string, driverId: string, ext: "jpg" | "png"): string {
  const c = companyId.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "company";
  const d = driverId.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "driver";
  return `${c}/drivers/${d}/avatar.${ext}`;
}

export function decodeValidatedDriverAvatarImage(input: string):
  | { ok: true; buffer: Buffer; ext: "jpg" | "png"; mime: "image/jpeg" | "image/png" }
  | { ok: false; error: string } {
  const decoded = decodeValidatedMedicalTransportImage(input);
  if (!decoded.ok) return decoded;
  if (decoded.buffer.length > AVATAR_MAX_BYTES) {
    return { ok: false, error: "image_size_invalid" };
  }
  return decoded;
}

export async function writeFleetDriverAvatarFile(
  companyId: string,
  driverId: string,
  buffer: Buffer,
  ext: "jpg" | "png",
): Promise<{ ok: true; storageKey: string } | { ok: false; error: string }> {
  const storageKey = fleetDriverAvatarStorageKey(companyId, driverId, ext);
  const abs = resolveAdminFleetUploadAbs(storageKey);
  if (!abs) return { ok: false, error: "invalid_storage_key" };
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // Alte Endung entfernen
    for (const oldExt of ["jpg", "png"] as const) {
      if (oldExt === ext) continue;
      const oldKey = fleetDriverAvatarStorageKey(companyId, driverId, oldExt);
      const oldAbs = resolveAdminFleetUploadAbs(oldKey);
      if (oldAbs) await fs.unlink(oldAbs).catch(() => {});
    }
    await fs.writeFile(abs, buffer);
    return { ok: true, storageKey };
  } catch {
    return { ok: false, error: "write_failed" };
  }
}

export async function deleteFleetDriverAvatarFile(storageKey: string | null | undefined): Promise<void> {
  const key = (storageKey ?? "").trim();
  if (!key) return;
  const abs = resolveAdminFleetUploadAbs(key);
  if (!abs) return;
  await fs.unlink(abs).catch(() => {});
}

/** API-Origin für absolute Avatar-URLs (RN Image braucht volle URL). */
export function resolvePublicApiOrigin(req?: Request): string {
  const env = (process.env.OAUTH_PUBLIC_ORIGIN ?? process.env.BACKEND_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  if (req) {
    const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0]?.trim();
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0]?.trim();
    if (proto && host) return `${proto}://${host}`;
  }
  return "https://api.onroda.de";
}

/** Öffentliche Avatar-URL nur wenn Consent + Key; sonst null (Kunde → Initialen). */
export function buildCustomerVisibleDriverAvatarUrl(input: {
  driverId: string;
  avatarStorageKey: string | null | undefined;
  avatarShowToCustomer: boolean | null | undefined;
  req?: Request;
}): string | null {
  if (!input.avatarShowToCustomer) return null;
  const key = (input.avatarStorageKey ?? "").trim();
  if (!key) return null;
  const id = input.driverId.trim();
  if (!id) return null;
  const origin = resolvePublicApiOrigin(input.req);
  return `${origin}/api/fleet-driver/v1/public-avatar/${encodeURIComponent(id)}`;
}

export function avatarMimeFromStorageKey(storageKey: string): string {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export { adminFleetUploadRoot, resolveAdminFleetUploadAbs };
