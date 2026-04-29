/**
 * Krankenfahrt: flache Felder in `rides.partner_booking_meta` (JSONB).
 * Keine Diagnose / keine medizinischen Freitexte — nur fahrtrelevante Nachweise.
 */

import type { PartnerBookingMeta } from "./partnerBookingMeta";

export type MedicalRidePartnerMeta = Record<string, unknown> & {
  medical_ride: true;
};

export function isMedicalRidePartnerMeta(v: unknown): v is MedicalRidePartnerMeta {
  return v !== null && typeof v === "object" && !Array.isArray(v) && (v as Record<string, unknown>).medical_ride === true;
}

/** DB-Zeile → RideRequest.partnerBookingMeta (Medical-JSON oder typisiertes Partner-Meta). */
export function parsePartnerBookingMetaFromRow(
  raw: unknown,
  parseTyped: (raw: unknown) => PartnerBookingMeta | null,
): PartnerBookingMeta | MedicalRidePartnerMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (isMedicalRidePartnerMeta(raw)) return raw as MedicalRidePartnerMeta;
  return parseTyped(raw);
}

/** Serialisierung für `partner_booking_meta` — Medical-Objekt 1:1, sonst typisiertes Meta. */
export function partnerBookingMetaToDbJson(
  meta: PartnerBookingMeta | MedicalRidePartnerMeta | null | undefined,
  metaToJsonTyped: (m: PartnerBookingMeta) => Record<string, unknown>,
): Record<string, unknown> {
  if (!meta) return {};
  if (isMedicalRidePartnerMeta(meta)) {
    return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
  }
  return metaToJsonTyped(meta as PartnerBookingMeta);
}
