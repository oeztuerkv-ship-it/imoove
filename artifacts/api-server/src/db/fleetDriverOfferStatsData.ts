import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { rideDriverDispatchOffersTable, rideEventsTable } from "./schema";

/** Rollierendes Fenster für Fahrer-Angebotsstatistik in `/fleet-driver/v1/me`. */
export const FLEET_DRIVER_OFFER_STATS_PERIOD_DAYS = 30;

export type FleetDriverOfferStats = {
  periodDays: number;
  offersSent: number;
  offersAccepted: number;
  offersRejected: number;
  acceptanceRatePercent: number | null;
  rejectionRatePercent: number | null;
  dispatchRejectStreak: number;
};

const EMPTY_STATS: FleetDriverOfferStats = {
  periodDays: FLEET_DRIVER_OFFER_STATS_PERIOD_DAYS,
  offersSent: 0,
  offersAccepted: 0,
  offersRejected: 0,
  acceptanceRatePercent: null,
  rejectionRatePercent: null,
  dispatchRejectStreak: 0,
};

function ratePercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Markt-Angebote (`ride_driver_dispatch_offers`) + explizite Ablehnungen (`ride_events.driver_rejected`).
 * Annahmen zählen nur mit `accepted_at`; Ablehnungen nur `driver_rejected` (nicht Soft-Storno nach Annahme).
 */
export async function getFleetDriverOfferStats(
  fleetDriverId: string,
  companyId: string,
  dispatchRejectStreak: number,
): Promise<FleetDriverOfferStats> {
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid || !isPostgresConfigured()) {
    return { ...EMPTY_STATS, dispatchRejectStreak: Math.max(0, dispatchRejectStreak || 0) };
  }
  const db = getDb();
  if (!db) {
    return { ...EMPTY_STATS, dispatchRejectStreak: Math.max(0, dispatchRejectStreak || 0) };
  }

  const since = new Date(Date.now() - FLEET_DRIVER_OFFER_STATS_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const offerBase = and(
    eq(rideDriverDispatchOffersTable.fleet_driver_id, did),
    eq(rideDriverDispatchOffersTable.company_id, cid),
    gte(rideDriverDispatchOffersTable.sent_at, since),
  );

  const [sentRows, acceptedRows, rejectedRows] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(rideDriverDispatchOffersTable)
      .where(offerBase),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(rideDriverDispatchOffersTable)
      .where(and(offerBase, isNotNull(rideDriverDispatchOffersTable.accepted_at))),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(rideEventsTable)
      .where(
        and(
          eq(rideEventsTable.event_type, "driver_rejected"),
          eq(rideEventsTable.actor_id, did),
          gte(rideEventsTable.created_at, since),
        ),
      ),
  ]);

  const offersSent = Number(sentRows[0]?.c ?? 0);
  const offersAccepted = Number(acceptedRows[0]?.c ?? 0);
  const offersRejected = Number(rejectedRows[0]?.c ?? 0);
  const decisions = offersAccepted + offersRejected;

  return {
    periodDays: FLEET_DRIVER_OFFER_STATS_PERIOD_DAYS,
    offersSent,
    offersAccepted,
    offersRejected,
    acceptanceRatePercent: ratePercent(offersAccepted, decisions),
    rejectionRatePercent: ratePercent(offersRejected, decisions),
    dispatchRejectStreak: Math.max(0, dispatchRejectStreak || 0),
  };
}
