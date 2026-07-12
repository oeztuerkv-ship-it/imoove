/**
 * Chat für zugewiesene A-Fahrer-Fahrt nachträglich aktivieren (nach Fix-Deploy).
 *
 *   cd artifacts/api-server && pnpm run repair-ride-chat-enabled -- REQ-dcd1b45a-…
 *
 * Liest `.env` aus dem api-server-Ordner (DATABASE_URL, …) — wie retry-ride-payment-capture.
 */
import "../loadEnv.js";
import { closeDbPool } from "../db/client.js";
import { repairRideChatForAssignedRide } from "../db/rideChatMessagesData.js";

const rideId = process.argv.slice(2).find((arg) => arg.trim() && !arg.startsWith("-"))?.trim();
if (!rideId) {
  console.error("Usage: pnpm run repair-ride-chat-enabled -- <rideId>");
  process.exit(1);
}

const result = await repairRideChatForAssignedRide(rideId);
console.log(JSON.stringify(result, null, 2));
await closeDbPool();
process.exit(result.chatEnabled ? 0 : 1);
