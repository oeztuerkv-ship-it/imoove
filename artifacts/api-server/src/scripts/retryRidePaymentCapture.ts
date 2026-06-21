/**
 * Direkt gegen DB + Stripe (ohne laufende API).
 *
 *   cd artifacts/api-server
 *   pnpm run retry-ride-payment-capture -- REQ-1782054245360
 *
 * Liest `.env` aus dem api-server-Ordner (DATABASE_URL, STRIPE_SECRET_KEY, …).
 */
import "../loadEnv.js";
import { retryOperatorRidePaymentCapture } from "../lib/ridePaymentRecovery.js";

const rideId = process.argv[2]?.trim();
if (!rideId) {
  console.error("Usage: pnpm run retry-ride-payment-capture -- <rideId>");
  process.exit(1);
}

const result = await retryOperatorRidePaymentCapture(rideId, { actorId: "script:retryRidePaymentCapture" });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
