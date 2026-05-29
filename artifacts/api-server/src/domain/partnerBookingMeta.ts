/**
 * Strukturierter Buchungskontext für Partner-Flows (Hotel, Medizin, Serien).
 * Persistiert in `rides.partner_booking_meta` (JSONB). Öffentlicher Ride-Pool liefert das Feld nicht aus.
 */

export type PartnerBookingFlow = "hotel_guest" | "medical_patient" | "medical_series_leg";

/** Hotel: wer soll auf der internen Abrechnung erscheinen (ergänzt payerKind). */
export type HotelBilledTo = "guest" | "room_ledger" | "company";

export type MedicalTripLeg = "outbound" | "return";

/** In JSONB neben flow/hotel — Partner-Liste, Suche, Ausblenden (nicht für öffentlichen Pool). */
export const PARTNER_OPERATIONAL_META_KEYS = [
  "partner_hidden",
  "partner_hidden_at",
  "partner_archived",
  "search_started_at",
  "last_retry_at",
] as const;

export function mergePartnerOperationalMetaFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...target };
  for (const key of PARTNER_OPERATIONAL_META_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

export function isPartnerRideHiddenInMeta(meta: Record<string, unknown>): boolean {
  const hidden = meta.partner_hidden;
  const archived = meta.partner_archived;
  return (
    hidden === true
    || hidden === "true"
    || archived === true
    || archived === "true"
  );
}

export interface PartnerBookingMeta {
  flow: PartnerBookingFlow;
  partner_hidden?: boolean;
  partner_hidden_at?: string | null;
  partner_archived?: boolean;
  search_started_at?: string | null;
  last_retry_at?: string | null;
  hotel?: {
    roomNumber?: string | null;
    reservationRef?: string | null;
    billedTo?: HotelBilledTo | null;
  };
  medical?: {
    patientReference?: string | null;
    tripLeg?: MedicalTripLeg | null;
    linkedRideId?: string | null;
    seriesId?: string | null;
    seriesSequence?: number | null;
    seriesTotal?: number | null;
    seriesValidFrom?: string | null;
    seriesValidUntil?: string | null;
  };
  /**
   * Krankenkasse / Kostenträger-Panel: organisationale Zuordnung — keine medizinischen Befunde.
   * Kostenstelle = interne Referenz; Anzeigename/Referenz für Fahrt ohne Diagnose-Speicherung.
   */
  insurer?: {
    costCenterId?: string | null;
    passengerRef?: string | null;
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** JSON aus DB/API-Body in typisierte Meta-Struktur; unbekannte Felder werden verworfen. */
export function parsePartnerBookingMeta(raw: unknown): PartnerBookingMeta | null {
  if (!isRecord(raw)) return null;
  const flow = raw.flow;
  if (flow !== "hotel_guest" && flow !== "medical_patient" && flow !== "medical_series_leg") {
    return null;
  }
  const out: PartnerBookingMeta = { flow };
  if (isRecord(raw.hotel)) {
    const bt = raw.hotel.billedTo;
    out.hotel = {
      roomNumber: typeof raw.hotel.roomNumber === "string" ? raw.hotel.roomNumber : null,
      reservationRef: typeof raw.hotel.reservationRef === "string" ? raw.hotel.reservationRef : null,
      billedTo:
        bt === "guest" || bt === "room_ledger" || bt === "company"
          ? bt
          : null,
    };
  }
  if (isRecord(raw.medical)) {
    const m = raw.medical;
    const tripLeg = m.tripLeg;
    out.medical = {
      patientReference: typeof m.patientReference === "string" ? m.patientReference : null,
      tripLeg:
        tripLeg === "outbound" || tripLeg === "return" ? tripLeg : null,
      linkedRideId: typeof m.linkedRideId === "string" ? m.linkedRideId : null,
      seriesId: typeof m.seriesId === "string" ? m.seriesId : null,
      seriesSequence: typeof m.seriesSequence === "number" && Number.isFinite(m.seriesSequence) ? m.seriesSequence : null,
      seriesTotal: typeof m.seriesTotal === "number" && Number.isFinite(m.seriesTotal) ? m.seriesTotal : null,
      seriesValidFrom: typeof m.seriesValidFrom === "string" ? m.seriesValidFrom : null,
      seriesValidUntil: typeof m.seriesValidUntil === "string" ? m.seriesValidUntil : null,
    };
  }
  if (isRecord(raw.insurer)) {
    const ins = raw.insurer;
    out.insurer = {
      costCenterId: typeof ins.costCenterId === "string" ? ins.costCenterId : null,
      passengerRef: typeof ins.passengerRef === "string" ? ins.passengerRef : null,
    };
  }
  return mergePartnerOperationalMetaFields(out as Record<string, unknown>, raw) as PartnerBookingMeta;
}

export function metaToJson(meta: PartnerBookingMeta | null | undefined): Record<string, unknown> {
  if (!meta) return {};
  return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
}
