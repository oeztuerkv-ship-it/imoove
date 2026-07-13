import type { Response } from "express";
import type { RideRequest } from "../domain/rideRequest";
import { findCompanyById } from "../db/adminData";
import {
  listRideChatMessages,
  parseRideChatClientMessageId,
  parseRideChatMessageBody,
  postRideChatMessage,
  rideChatPostHttpStatus,
  type RideChatSenderKind,
} from "../db/rideChatMessagesData";
import { broadcastRideChatMessage } from "../wsRideSocketHub";

async function resolveRidePartnerDisplayName(ride: RideRequest): Promise<string | null> {
  const companyId = (ride.companyId ?? "").trim();
  if (!companyId) return null;
  const company = await findCompanyById(companyId);
  const name = (company?.name ?? "").trim() || (company?.billing_name ?? "").trim();
  return name || null;
}

export async function sendRideChatMessagesJson(
  res: Response,
  ride: RideRequest,
  queryAfter?: string,
): Promise<void> {
  const items = await listRideChatMessages(ride.id, { after: queryAfter });
  const partnerDisplayName = await resolveRidePartnerDisplayName(ride);
  res.json({
    ok: true,
    rideId: ride.id,
    chatEnabled: Boolean(ride.chatEnabled),
    partnerDisplayName,
    items,
  });
}

export async function sendRideChatMessageCreated(
  res: Response,
  ride: RideRequest,
  body: unknown,
  sender: { kind: Exclude<RideChatSenderKind, "booking_note">; actorId: string },
): Promise<void> {
  const text = parseRideChatMessageBody(body);
  if (!text) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const clientMessageId = parseRideChatClientMessageId(body);
  const result = await postRideChatMessage({
    ride,
    senderKind: sender.kind,
    senderActorId: sender.actorId,
    body: text,
    clientMessageId,
  });
  if (!result.ok) {
    res.status(rideChatPostHttpStatus(result.error)).json({ error: result.error });
    return;
  }
  res.status(result.created ? 201 : 200).json({ ok: true, message: result.message });
  broadcastRideChatMessage(ride.id, result.message);
}
