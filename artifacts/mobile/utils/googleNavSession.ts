/** Serial native operations; superseded destinations must never start guidance. */
export function createGoogleNavWorkQueue() {
  let revision = 0;
  let disposed = false;
  let tail: Promise<void> = Promise.resolve();
  return {
    run(work: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
      const own = ++revision;
      const isCurrent = () => !disposed && revision === own;
      const task = tail.then(async () => { if (isCurrent()) await work(isCurrent); });
      tail = task.catch(() => {});
      return task;
    },
    invalidate() { revision++; },
    dispose() { disposed = true; revision++; },
    idle() { return tail; },
  };
}

export type GoogleNavPoint = { lat: number; lon: number };
export function validGoogleNavPoint(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Preserve actual SDK route geometry; never manufacture a straight-line route. */
export function googleRoutePoints(segments: { segmentLatLngList: { lat: number; lng: number }[] }[]): GoogleNavPoint[] {
  const points: GoogleNavPoint[] = [];
  for (const segment of segments) for (const p of segment.segmentLatLngList ?? []) {
    if (!validGoogleNavPoint(p.lat, p.lng)) continue;
    const prev = points[points.length - 1];
    if (!prev || prev.lat !== p.lat || prev.lon !== p.lng) points.push({ lat: p.lat, lon: p.lng });
  }
  return points;
}
