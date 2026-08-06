import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "../db/client";
import { passengerProfilesTable } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { logger } from "./logger";

const PIN_RE = /^\d{4}$/;
const VERIFY_FAIL_LIMIT = 5;
const VERIFY_FAIL_WINDOW_MS = 10 * 60 * 1000;

const verifyFailBucket = new Map<string, { count: number; windowStartedAt: number }>();

export function isValidCustomerRidePin(pin: string): boolean {
  return PIN_RE.test(String(pin ?? "").trim());
}

/** Echte App-Kundenfahrt — nicht Partner-/KK-/Gutschein-/Code-/Funk-Buchung. */
export function rideRequiresPassengerPin(ride: Pick<
  RideRequest,
  | "passengerId"
  | "createdByPanelUserId"
  | "authorizationSource"
  | "accessCodeId"
  | "rideKind"
  | "payerKind"
  | "voucherCode"
  | "dispatchMode"
>): boolean {
  if ((ride.dispatchMode ?? "market") === "funk") return false;
  const pid = (ride.passengerId ?? "").trim();
  if (!pid) return false;
  if ((ride.createdByPanelUserId ?? "").trim()) return false;
  if ((ride.accessCodeId ?? "").trim()) return false;
  if ((ride.voucherCode ?? "").trim()) return false;
  if (ride.authorizationSource !== "passenger_direct") return false;
  if (ride.rideKind !== "standard") return false;
  if (ride.payerKind !== "passenger") return false;
  return true;
}

export const CUSTOMER_CANCEL_BLOCKED_TRIP_STARTED = "customer_cancel_blocked_trip_started";
export const CUSTOMER_CANCEL_BLOCKED_TRIP_STARTED_MESSAGE_DE =
  "Der Startcode wurde bestätigt. Storno oder Abbruch ist nicht mehr möglich.";

/**
 * Kunden-Storno/Abbruch gesperrt?
 *
 * - Zurück im Markt / Suche (`searching_driver` …): **immer** stornierbar
 *   (auch nach Soft-Cancel, wenn Startcode vorher schon gesetzt war).
 * - App-Direktfahrten mit PIN-Pflicht: **nur** nach Startcode (`passengerPinVerifiedAt`),
 *   solange die Fahrt noch zugewiesen ist.
 * - Sonstige Fahrten (Funk/Panel/…): Sperre ab `in_progress` / `passenger_onboard`.
 */
export function isCustomerCancelBlockedAfterTripStart(
  ride: Pick<
    RideRequest,
    | "status"
    | "passengerPinVerifiedAt"
    | "passengerId"
    | "createdByPanelUserId"
    | "authorizationSource"
    | "accessCodeId"
    | "rideKind"
    | "payerKind"
    | "voucherCode"
    | "dispatchMode"
  >,
): boolean {
  const s = String(ride.status ?? "").trim();
  // Soft-Cancel / Re-Dispatch: Kunde muss die Suche jederzeit abbrechen können.
  if (
    s === "pending" ||
    s === "requested" ||
    s === "searching_driver" ||
    s === "offered" ||
    s === "draft" ||
    s === "scheduled"
  ) {
    return false;
  }
  if (ride.passengerPinVerifiedAt) return true;
  // PIN-pflichtig: ohne Verify immer noch stornierbar (auch Anfahrt / Ankunft / irrtümliches in_progress).
  if (rideRequiresPassengerPin(ride)) return false;
  return s === "in_progress" || s === "passenger_onboard";
}

function pinCryptoKey(): Buffer {
  const secret = (
    process.env.CUSTOMER_RIDE_PIN_SECRET ??
    process.env.AUTH_JWT_SECRET ??
    process.env.SESSION_JWT_SECRET ??
    process.env.JWT_SECRET ??
    "onroda-dev-ride-pin-key"
  ).trim();
  return createHash("sha256").update(secret).digest();
}

/**AES-256-GCM: `v1.<iv_b64url>.<tag_b64url>.<ct_b64url>` */
export function sealCustomerRidePin(plainPin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinCryptoKey(), iv);
  const ct = Buffer.concat([cipher.update(plainPin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function openCustomerRidePin(sealed: string): string | null {
  const parts = String(sealed ?? "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, ivB64, tagB64, ctB64] = parts;
  if (!ivB64 || !tagB64 || !ctB64) return null;
  try {
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const ct = Buffer.from(ctB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", pinCryptoKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    return isValidCustomerRidePin(plain) ? plain : null;
  } catch {
    return null;
  }
}

export function generateCustomerRidePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

export type EnsuredPassengerRidePin = {
  pin: string;
  created: boolean;
  setAt: string;
};

export async function ensurePassengerRideVerifyPin(passengerId: string): Promise<EnsuredPassengerRidePin | null> {
  const db = getDb();
  if (!db) return null;
  const pid = passengerId.trim();
  if (!pid) return null;

  const rows = await db
    .select({
      hash: passengerProfilesTable.ride_verify_pin_hash,
      enc: passengerProfilesTable.ride_verify_pin_enc,
      setAt: passengerProfilesTable.ride_verify_pin_set_at,
    })
    .from(passengerProfilesTable)
    .where(eq(passengerProfilesTable.passenger_id, pid))
    .limit(1);
  const row = rows[0];
  if (!row) {
    logger.warn({ passengerId: pid }, "[ride-pin] passenger_profiles row missing — cannot ensure PIN");
    return null;
  }

  if (row.hash && row.enc) {
    const existing = openCustomerRidePin(row.enc);
    if (existing) {
      return {
        pin: existing,
        created: false,
        setAt: (row.setAt ?? new Date()).toISOString(),
      };
    }
  }

  const pin = generateCustomerRidePin();
  const hash = await hashPassword(pin);
  const enc = sealCustomerRidePin(pin);
  const now = new Date();
  await db
    .update(passengerProfilesTable)
    .set({
      ride_verify_pin_hash: hash,
      ride_verify_pin_enc: enc,
      ride_verify_pin_set_at: now,
      updated_at: now,
    })
    .where(eq(passengerProfilesTable.passenger_id, pid));

  logger.info({ passengerId: pid, event: "ride_pin.auto_assigned" }, "[ride-pin] auto-assigned 4-digit PIN");
  return { pin, created: true, setAt: now.toISOString() };
}

export async function setPassengerRideVerifyPin(
  passengerId: string,
  newPin: string,
): Promise<{ ok: true; setAt: string } | { ok: false; error: string; message: string }> {
  if (!isValidCustomerRidePin(newPin)) {
    return { ok: false, error: "invalid_pin", message: "Bitte einen 4-stelligen Zahlencode eingeben." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "db_unavailable", message: "Speichern fehlgeschlagen." };
  const pid = passengerId.trim();
  if (!pid) return { ok: false, error: "unauthorized", message: "Nicht angemeldet." };

  const hash = await hashPassword(newPin.trim());
  const enc = sealCustomerRidePin(newPin.trim());
  const now = new Date();
  const updated = await db
    .update(passengerProfilesTable)
    .set({
      ride_verify_pin_hash: hash,
      ride_verify_pin_enc: enc,
      ride_verify_pin_set_at: now,
      updated_at: now,
    })
    .where(eq(passengerProfilesTable.passenger_id, pid))
    .returning({ id: passengerProfilesTable.passenger_id });
  if (updated.length === 0) {
    return { ok: false, error: "profile_missing", message: "Profil nicht gefunden." };
  }
  return { ok: true, setAt: now.toISOString() };
}

function checkVerifyRateLimit(rideId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cur = verifyFailBucket.get(rideId);
  if (!cur || now - cur.windowStartedAt > VERIFY_FAIL_WINDOW_MS) {
    return { ok: true };
  }
  if (cur.count >= VERIFY_FAIL_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((cur.windowStartedAt + VERIFY_FAIL_WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

function recordVerifyFailure(rideId: string): void {
  const now = Date.now();
  const cur = verifyFailBucket.get(rideId);
  if (!cur || now - cur.windowStartedAt > VERIFY_FAIL_WINDOW_MS) {
    verifyFailBucket.set(rideId, { count: 1, windowStartedAt: now });
    return;
  }
  cur.count += 1;
}

function clearVerifyFailures(rideId: string): void {
  verifyFailBucket.delete(rideId);
}

export type VerifyPassengerPinResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: string; message: string; status: number; retryAfterSec?: number };

export async function verifyPassengerRidePinForRide(
  ride: RideRequest,
  plainPin: string,
): Promise<VerifyPassengerPinResult> {
  if (!rideRequiresPassengerPin(ride)) {
    return {
      ok: false,
      error: "pin_not_required",
      message: "Für diese Fahrt ist keine PIN-Prüfung nötig.",
      status: 400,
    };
  }
  const rideId = ride.id;
  const rate = checkVerifyRateLimit(rideId);
  if (!rate.ok) {
    return {
      ok: false,
      error: "passenger_pin_rate_limited",
      message: `Zu viele Fehlversuche. Bitte in ${rate.retryAfterSec} Sekunden erneut versuchen.`,
      status: 429,
      retryAfterSec: rate.retryAfterSec,
    };
  }
  if (!isValidCustomerRidePin(plainPin)) {
    recordVerifyFailure(rideId);
    return {
      ok: false,
      error: "passenger_pin_invalid",
      message: "Code ungültig. Bitte 4 Ziffern vom Fahrgast eingeben.",
      status: 400,
    };
  }

  const pid = (ride.passengerId ?? "").trim();
  await ensurePassengerRideVerifyPin(pid);

  const db = getDb();
  if (!db) {
    return { ok: false, error: "db_unavailable", message: "Prüfung nicht möglich.", status: 503 };
  }
  const rows = await db
    .select({ hash: passengerProfilesTable.ride_verify_pin_hash })
    .from(passengerProfilesTable)
    .where(eq(passengerProfilesTable.passenger_id, pid))
    .limit(1);
  const hash = rows[0]?.hash;
  if (!hash) {
    return {
      ok: false,
      error: "passenger_pin_missing",
      message: "Kunden-Code fehlt. Bitte Support oder Kunde (App-Profil) prüfen.",
      status: 409,
    };
  }

  const match = await verifyPassword(plainPin.trim(), hash);
  if (!match) {
    recordVerifyFailure(rideId);
    return {
      ok: false,
      error: "passenger_pin_invalid",
      message: "Falscher Code. Fahrtstart bleibt gesperrt — bitte erneut beim Fahrgast nachfragen.",
      status: 403,
    };
  }

  clearVerifyFailures(rideId);
  const verifiedAt = new Date().toISOString();
  return { ok: true, verifiedAt };
}
