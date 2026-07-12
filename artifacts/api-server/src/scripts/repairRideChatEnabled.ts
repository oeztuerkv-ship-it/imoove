/**
 * Chat für zugewiesene A-Fahrer-Fahrt nachträglich aktivieren (nach Fix-Deploy).
 *
 *   cd artifacts/api-server && pnpm run repair-ride-chat-enabled -- REQ-dcd1b45a-…
 */
import { repairRideChatForAssignedRide } from "../db/rideChatMessagesData.js";

const rideId = process.argv[2]?.trim();
if (!rideId) {
  console.error("Usage: pnpm run repair-ride-chat-enabled -- <rideId>");
  process.exit(1);
}

const result = await repairRideChatForAssignedRide(rideId);
console.log(JSON.stringify(result, null, 2));
process.exit(result.chatEnabled ? 0 : 1);
