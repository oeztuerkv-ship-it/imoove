import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { RIDE_TERMINAL_STATUSES } from "../lib/rideStatusMachine";
import { getDb } from "./client";
import { getFleetDriverDispatchPriority, findFleetDriverAuthRow, findFleetDriverInCompany } from "./fleetDriversData";
import { insertSupplementalRideEvent } from "./ridesData";
import { rideChatMessagesTable, ridesTable } from "./schema";

export type RideChatSenderKind = "booking_note" | "customer" | "partner" | "driver";

const CHAT_BODY_MAX_LEN = 1000;
const CLIENT_MESSAGE_ID_MAX_LEN = 64;

export type RideChatMessageDto = {
  id: string;
  senderKind: RideChatSenderKind;
  senderActorId: string | null;
  body: string;
  createdAt: string;
};

function rowToRideChatMessageDto(row: typeof rideChatMessagesTable.$inferSelect): RideChatMessageDto {
  return {
    id: row.id,
    senderKind: row.sender_kind as RideChatSenderKind,
    senderActorId: row.sender_actor_id ?? null,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function parseRideChatMessageBody(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = String((raw as { body?: unknown }).body ?? "").trim();
  if (!body || body.length > CHAT_BODY_MAX_LEN) return null;
  return body;
}

export function parseRideChatClientMessageId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = String((raw as { clientMessageId?: unknown }).clientMessageId ?? "").trim();
  if (!id || id.length > CLIENT_MESSAGE_ID_MAX_LEN) return null;
  return id;
}

export async function listRideChatMessages(
  rideId: string,
  opts?: { after?: string },
): Promise<RideChatMessageDto[]> {
  const rid = rideId.trim();
  if (!rid) return [];
  const db = getDb();
  if (!db) return [];

  const afterRaw = (opts?.after ?? "").trim();
  const afterDate = afterRaw ? new Date(afterRaw) : null;
  const afterValid = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const rows = await db
    .select()
    .from(rideChatMessagesTable)
    .where(
      afterValid
        ? and(eq(rideChatMessagesTable.ride_id, rid), gt(rideChatMessagesTable.created_at, afterValid))
        : eq(rideChatMessagesTable.ride_id, rid),
    )
    .orderBy(asc(rideChatMessagesTable.created_at));

  return rows.map(rowToRideChatMessageDto);
}

export type PostRideChatMessageResult =
  | { ok: true; message: RideChatMessageDto; created: boolean }
  | { ok: false; error: "chat_not_enabled" | "chat_closed" | "invalid_body" };

/** Nachricht senden — nur bei aktivem, nicht-terminalen Chat (strikt fahrtgebunden). */
export async function postRideChatMessage(input: {
  ride: RideRequest;
  senderKind: Exclude<RideChatSenderKind, "booking_note">;
  senderActorId: string;
  body: string;
  clientMessageId?: string | null;
}): Promise<PostRideChatMessageResult> {
  const ride = input.ride;
  if (!ride.chatEnabled) return { ok: false, error: "chat_not_enabled" };
  if (RIDE_TERMINAL_STATUSES.has(ride.status)) return { ok: false, error: "chat_closed" };

  const body = input.body.trim();
  if (!body || body.length > CHAT_BODY_MAX_LEN) return { ok: false, error: "invalid_body" };

  const actorId = input.senderActorId.trim();
  if (!actorId) return { ok: false, error: "invalid_body" };

  const db = getDb();
  if (!db) return { ok: false, error: "chat_not_enabled" };

  const clientMessageId = (input.clientMessageId ?? "").trim() || null;
  const id = `rcm-${randomUUID()}`;
  const createdAt = new Date();

  try {
    const rows = await db
      .insert(rideChatMessagesTable)
      .values({
        id,
        ride_id: ride.id,
        sender_kind: input.senderKind,
        sender_actor_id: actorId,
        body,
        client_message_id: clientMessageId,
        created_at: createdAt,
      })
      .returning();
    const row = rows[0];
    if (!row) return { ok: false, error: "invalid_body" };
    return { ok: true, message: rowToRideChatMessageDto(row), created: true };
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "23505" && clientMessageId) {
      const existing = await db
        .select()
        .from(rideChatMessagesTable)
        .where(
          and(
            eq(rideChatMessagesTable.ride_id, ride.id),
            eq(rideChatMessagesTable.sender_actor_id, actorId),
            eq(rideChatMessagesTable.client_message_id, clientMessageId),
          ),
        )
        .limit(1);
      const row = existing[0];
      if (row) return { ok: true, message: rowToRideChatMessageDto(row), created: false };
    }
    throw e;
  }
}

export function rideChatPostHttpStatus(
  error: "chat_not_enabled" | "chat_closed" | "invalid_body",
): number {
  switch (error) {
    case "chat_not_enabled":
    case "chat_closed":
      return 409;
    case "invalid_body":
      return 400;
    default:
      return 400;
  }
}

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

/** Taxi-Mandant des Fahrers — bei Partner-Fahrten ≠ rides.company_id. */
async function resolveFleetDriverCompanyForChat(
  driverId: string,
  hintCompanyId?: string,
): Promise<string> {
  const hint = (hintCompanyId ?? "").trim();
  if (hint) {
    const inHint = await findFleetDriverInCompany(driverId, hint);
    if (inHint) return hint;
  }
  const auth = await findFleetDriverAuthRow(driverId);
  return (auth?.company_id ?? "").trim();
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
  if (!driverId) return ride;
  if (ride.chatEnabled) return ride;

  const fleetDriverCompanyId = await resolveFleetDriverCompanyForChat(
    driverId,
    input.fleetDriverCompanyId,
  );
  if (!fleetDriverCompanyId) return ride;

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

/** Idempotent: Chat für zugewiesene A-Fahrer-Fahrt nachträglich aktivieren (Repair nach Deploy). */
export async function repairRideChatForAssignedRide(rideId: string): Promise<{
  ok: boolean;
  chatEnabled: boolean;
  reason: string;
}> {
  const id = rideId.trim();
  if (!id) return { ok: false, chatEnabled: false, reason: "missing_ride_id" };

  const { findRide } = await import("./ridesData.js");
  const ride = await findRide(id);
  if (!ride) {
    const { isPostgresConfigured } = await import("./client.js");
    if (!isPostgresConfigured()) {
      return { ok: false, chatEnabled: false, reason: "database_not_configured" };
    }
    return { ok: false, chatEnabled: false, reason: "not_found" };
  }
  if (ride.chatEnabled) return { ok: true, chatEnabled: true, reason: "already_enabled" };

  const driverId = (ride.driverId ?? "").trim();
  if (!driverId) return { ok: false, chatEnabled: false, reason: "no_driver" };
  if (ride.status !== "accepted" && ride.status !== "scheduled_assigned") {
    return { ok: false, chatEnabled: false, reason: "status_not_assigned" };
  }

  const updated = await applyRideChatOnFleetDriverAccept({
    ride,
    driverId,
    fleetDriverCompanyId: "",
    actor: { actorType: "system", actorId: null },
  });
  if (updated.chatEnabled) return { ok: true, chatEnabled: true, reason: "enabled" };
  return { ok: false, chatEnabled: false, reason: "priority_not_a_or_failed" };
}
