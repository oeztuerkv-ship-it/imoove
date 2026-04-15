/**
 * Öffentlicher Zustand eines Freigabe-Codes (Panel / API).
 * DB speichert `lifecycle_status` (active | reserved | redeemed); cancelled / expired leiten wir ab.
 */
export const ACCESS_CODE_PUBLIC_STATUSES = [
  "active",
  "not_yet_valid",
  "reserved",
  "redeemed",
  "cancelled",
  "expired",
] as const;

export type AccessCodePublicStatus = (typeof ACCESS_CODE_PUBLIC_STATUSES)[number];

/** Persistierter Zustand in `access_codes.lifecycle_status` (kein Boolean allein). */
export const ACCESS_CODE_DB_LIFECYCLE = ["active", "reserved", "redeemed"] as const;
export type AccessCodeDbLifecycle = (typeof ACCESS_CODE_DB_LIFECYCLE)[number];

export function isAccessCodeDbLifecycle(s: string): s is AccessCodeDbLifecycle {
  return (ACCESS_CODE_DB_LIFECYCLE as readonly string[]).includes(s);
}

export type AccessCodeStatusInput = {
  isActive: boolean;
  lifecycleStatus: string;
  reservedRideId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usesCount: number;
};

export function computeAccessCodePublicStatus(row: AccessCodeStatusInput): {
  status: AccessCodePublicStatus;
  labelDe: string;
} {
  if (!row.isActive) {
    return { status: "cancelled", labelDe: "Deaktiviert" };
  }
  const now = Date.now();
  if (row.validFrom) {
    const t = new Date(row.validFrom).getTime();
    if (Number.isFinite(t) && t > now) {
      return { status: "not_yet_valid", labelDe: "Noch nicht gültig" };
    }
  }
  if (row.validUntil) {
    const t = new Date(row.validUntil).getTime();
    if (Number.isFinite(t) && t < now) {
      return { status: "expired", labelDe: "Abgelaufen" };
    }
  }
  const exhausted = row.maxUses != null && row.usesCount >= row.maxUses;
  const dbRedeemed = row.lifecycleStatus === "redeemed";
  if (exhausted || dbRedeemed) {
    return { status: "redeemed", labelDe: "Eingelöst / Kontingent aufgebraucht" };
  }
  if (row.lifecycleStatus === "reserved" || (row.reservedRideId != null && row.reservedRideId !== "")) {
    return { status: "reserved", labelDe: "In Benutzung (reserviert)" };
  }
  return { status: "active", labelDe: "Frei / aktiv" };
}
