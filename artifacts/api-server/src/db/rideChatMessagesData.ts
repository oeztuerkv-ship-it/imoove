import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { RIDE_TERMINAL_STATUSES } from "../lib/rideStatusMachine";
import { getDb } from "./client";
import { getFleetDriverDispatchPriority } from "./fleetDriversData";
import { insertSupplementalRideEvent } from "./ridesData";
import { rideChatMessagesTable, ridesTable } from "./schema";

export type RideChatSenderKind = "booking_note" | "customer" | "partner" | "driver";

const CHAT_BODY_MAX_LEN = 1000;

/** Kunden-/Partner-Hinweis aus `partner_booking_meta` (Vor-Chat-Phase). */
export function extractCustomerDriverNoteFromRide(ride: Pick<RideRequest, "partnerBookingMeta">): string {
  const meta = ride.partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const rec = meta as Record<string, unknown>;
  const v = rec.customer_driver_note ?? rec.customerDriverNote;
  if (typeof v !== "string") return "";
  return v.trim().slice(0, CHAT_BODY_MAX_LEN);
}

/**
 * Chat ist strikt fahrtgebunden: Senden nur bei aktivem Chat und nicht-terminaler Fahrt.
 * Historie bleibt lesbar; kein Re-Open nach Abschluss/Storno.
 */
export function isRideChatWriteAllowed(ride: Pick<RideRequest, "chatEnabled" | "status">): boolean {
  if (!ride.chatEnabled) return false;
  return !RIDE_TERMINAL_STATUSES.has(ride.status);
}

/**
 * Nach Fahrer-Annahme: bei Dispatch-Priorität A Chat aktivieren und ggf. Notiz als erste Zeile seeden.
 * Idempotent — wiederholte Aufrufe ändern nichts.
 */
export async function applyRideChatOnFleetDriverAccept(input: {
  ride: RideRequest;
  driverId: string;
  fleetDriverCompanyId: string;
  actor?: { actorType: string; actorId: string | null };
}): Promise<RideRequest> {
  const ride = input.ride;
  const driverId = input.driverId.trim();
  const fleetDriverCompanyId = input.fleetDriverCompanyId.trim();
  if (!driverId || !fleetDriverCompanyId) return ride;
  if (ride.chatEnabled) return ride;

  const priority = await getFleetDriverDispatchPriority(driverId, fleetDriverCompanyId);
  if (priority !== "A") return ride;

  const db = getDb();
  const enabledAt = new Date();
  const note = extractCustomerDriverNoteFromRide(ride);

  if (!db) {
    return {
      ...ride,
      chatEnabled: true,
      chatEnabledAt: enabledAt.toISOString(),
    };
  }

  let enabled = false;
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(ridesTable)
      .set({
        chat_enabled: true,
        chat_enabled_at: enabledAt,
      })
      .where(and(eq(ridesTable.id, ride.id), eq(ridesTable.chat_enabled, false)))
      .returning({ id: ridesTable.id });

    if (!rows[0]) return;
    enabled = true;

    if (note) {
      await tx.insert(rideChatMessagesTable).values({
        id: `rcm-${randomUUID()}`,
        ride_id: ride.id,
        sender_kind: "booking_note",
        sender_actor_id: null,
        body: note,
        client_message_id: null,
        created_at: enabledAt,
      });
    }
  });

  if (!enabled) return ride;

  await insertSupplementalRideEvent(ride.id, {
    eventType: "ride_chat_enabled",
    fromStatus: ride.status,
    toStatus: ride.status,
    actorType: input.actor?.actorType ?? "driver",
    actorId: input.actor?.actorId ?? driverId,
    payload: { dispatchPriority: "A", driverId },
  });

  return {
    ...ride,
    chatEnabled: true,
    chatEnabledAt: enabledAt.toISOString(),
  };
}
