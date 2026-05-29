/**
 * Krankenfahrt: flache Felder in `rides.partner_booking_meta` (JSONB).
 * Keine Diagnose / keine medizinischen Freitexte — nur fahrtrelevante Nachweise.
 */

import type { PartnerBookingMeta } from "./partnerBookingMeta";
import { mergePartnerOperationalMetaFields, parsePartnerBookingMeta } from "./partnerBookingMeta";

/** Nur Kunden-Hinweis für den Fahrer (ohne Partner-flow). Persistiert in `partner_booking_meta`. */
export type CustomerDriverNotePartnerMeta = { customer_driver_note: string };

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
): PartnerBookingMeta | MedicalRidePartnerMeta | CustomerDriverNotePartnerMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (isMedicalRidePartnerMeta(raw)) return raw as MedicalRidePartnerMeta;
  const typed = parseTyped(raw);
  if (typed) {
    return mergePartnerOperationalMetaFields(typed as Record<string, unknown>, rec) as PartnerBookingMeta;
  }
  const v = rec.customer_driver_note ?? rec.customerDriverNote;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) {
      return mergePartnerOperationalMetaFields({ customer_driver_note: t.slice(0, 500) }, rec) as CustomerDriverNotePartnerMeta;
    }
  }
  const operationalOnly = mergePartnerOperationalMetaFields({}, rec);
  return Object.keys(operationalOnly).length > 0 ? (operationalOnly as CustomerDriverNotePartnerMeta) : null;
}

/** Serialisierung für `partner_booking_meta` — Medical-Objekt 1:1, sonst typisiertes Meta. */
export function partnerBookingMetaToDbJson(
  meta: PartnerBookingMeta | MedicalRidePartnerMeta | CustomerDriverNotePartnerMeta | null | undefined,
  metaToJsonTyped: (m: PartnerBookingMeta) => Record<string, unknown>,
): Record<string, unknown> {
  if (!meta) return {};
  const rec = meta as Record<string, unknown>;
  let json: Record<string, unknown>;
  if (isMedicalRidePartnerMeta(meta)) {
    json = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
  } else if (parsePartnerBookingMeta(meta) === null) {
    const v = rec.customer_driver_note ?? rec.customerDriverNote;
    if (typeof v === "string" && v.trim()) {
      json = { customer_driver_note: v.trim().slice(0, 500) };
    } else {
      json = {};
    }
  } else {
    json = metaToJsonTyped(meta as PartnerBookingMeta);
  }
  return mergePartnerOperationalMetaFields(json, rec);
}
