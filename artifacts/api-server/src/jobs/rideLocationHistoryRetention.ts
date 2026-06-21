import { purgeRideLocationHistoryOlderThan } from "../db/rideLocationHistoryData";
import { logger } from "../lib/logger";

/** Roh-GPS-Pings älter als 90 Tage löschen (aggregierte Werte bleiben auf rides). */
export const RIDE_LOCATION_HISTORY_RETENTION_DAYS = 90;

export async function purgeStaleRideLocationHistory(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RIDE_LOCATION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await purgeRideLocationHistoryOlderThan(cutoff);
  if (deleted > 0) {
    logger.info(
      { deleted, retentionDays: RIDE_LOCATION_HISTORY_RETENTION_DAYS, cutoff: cutoff.toISOString() },
      "[Cron] ride_location_history retention purge",
    );
  }
  return deleted;
}
