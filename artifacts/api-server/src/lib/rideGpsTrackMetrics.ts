import { GPS_OUTLIER_JUMP_KM } from "./gpsOutlierFilter";
import { haversineDistanceKm } from "./serviceRegionMatch";

/** Max. plausible Geschwindigkeit zwischen zwei Pings (~3 s Abstand). */
export const GPS_TRACK_MAX_SPEED_KMH = 150;

export type GpsTrackPoint = {
  lat: number;
  lon: number;
  recordedAt: Date;
};

function isPlausibleGpsSegment(prev: GpsTrackPoint, next: GpsTrackPoint): boolean {
  const dtMs = next.recordedAt.getTime() - prev.recordedAt.getTime();
  const distKm = haversineDistanceKm(prev.lat, prev.lon, next.lat, next.lon);
  if (distKm > GPS_OUTLIER_JUMP_KM) return false;
  if (dtMs <= 0) return distKm < 0.02;
  const speedKmh = distKm / (dtMs / 3_600_000);
  return speedKmh <= GPS_TRACK_MAX_SPEED_KMH;
}

/**
 * Distanz (Haversine-Summe gefilterter Segmente) + Dauer (tripStart → Abschluss).
 * Punkte außerhalb [tripStartedAt, completedAt] werden ignoriert.
 */
export function computeRideGpsTrackMetrics(
  points: GpsTrackPoint[],
  tripStartedAt: Date | null,
  completedAt: Date,
): { distanceKm: number; durationMinutes: number } | null {
  if (!(completedAt instanceof Date) || Number.isNaN(completedAt.getTime())) return null;

  const windowStart =
    tripStartedAt instanceof Date && !Number.isNaN(tripStartedAt.getTime()) ? tripStartedAt : null;
  const windowEnd = completedAt;

  const sorted = points
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        p.recordedAt instanceof Date &&
        !Number.isNaN(p.recordedAt.getTime()),
    )
    .filter((p) => {
      if (windowStart && p.recordedAt.getTime() < windowStart.getTime()) return false;
      return p.recordedAt.getTime() <= windowEnd.getTime();
    })
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  let distanceKm = 0;
  let prev: GpsTrackPoint | null = null;
  for (const pt of sorted) {
    if (prev && isPlausibleGpsSegment(prev, pt)) {
      distanceKm += haversineDistanceKm(prev.lat, prev.lon, pt.lat, pt.lon);
    }
    prev = pt;
  }

  let durationMinutes: number;
  if (windowStart) {
    const ms = windowEnd.getTime() - windowStart.getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    durationMinutes = Math.max(1, Math.round(ms / 60_000));
  } else if (sorted.length >= 2) {
    const ms = sorted[sorted.length - 1]!.recordedAt.getTime() - sorted[0]!.recordedAt.getTime();
    durationMinutes = Math.max(1, Math.round(ms / 60_000));
  } else {
    return null;
  }

  const roundedDistance = Math.round(distanceKm * 10) / 10;
  return {
    distanceKm: sorted.length >= 2 ? roundedDistance : 0,
    durationMinutes,
  };
}
