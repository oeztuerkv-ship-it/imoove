import type { Response } from "express";
import type { RideRequest } from "../domain/rideRequest";
import {
  listRideChatMessages,
  parseRideChatClientMessageId,
  parseRideChatMessageBody,
  postRideChatMessage,
  rideChatPostHttpStatus,
  type RideChatSenderKind,
} from "../db/rideChatMessagesData";
import { broadcastRideChatMessage } from "../wsRideSocketHub";

export async function sendRideChatMessagesJson(
  res: Response,
  ride: RideRequest,
  queryAfter?: string,
): Promise<void> {
  const items = await listRideChatMessages(ride.id, { after: queryAfter });
  res.json({
    ok: true,
    rideId: ride.id,
    chatEnabled: Boolean(ride.chatEnabled),
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
