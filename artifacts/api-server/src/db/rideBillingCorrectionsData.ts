import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { rideBillingCorrectionsTable } from "./schema";

export type CreateRideBillingCorrectionInput = {
  rideId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  reasonCode: string;
  actorType?: string;
  actorId?: string | null;
  createdAt?: Date;
};

function toStoredText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Append-only Korrekturzeile für abrechnungsrelevante Felder.
 * reasonCode ist verpflichtend, damit spätere Auswertung/Filter robust bleibt.
 */
export async function createRideBillingCorrection(input: CreateRideBillingCorrectionInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  const rideId = String(input.rideId ?? "").trim();
  const fieldName = String(input.fieldName ?? "").trim();
  const reasonCode = String(input.reasonCode ?? "").trim();
  if (!rideId || !fieldName || !reasonCode) {
    throw new Error("ride_billing_correction_invalid_input");
  }
  await db.insert(rideBillingCorrectionsTable).values({
    id: `rbc-${randomUUID()}`,
    ride_id: rideId,
    field_name: fieldName,
    old_value: toStoredText(input.oldValue),
    new_value: toStoredText(input.newValue),
    reason_code: reasonCode,
    reason_note: "",
    actor_type: (input.actorType ?? "system").trim() || "system",
    actor_id: input.actorId ?? null,
    created_at: input.createdAt ?? new Date(),
  });
}
