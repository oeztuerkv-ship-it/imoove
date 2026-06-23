/** Letzte Fahrer-Position für GET /fleet-driver/v1/market-rides (?lat=&lon=). */
let lastDriverMarketFetchLocation: { lat: number; lon: number } | null = null;

export function setDriverMarketFetchLocation(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  lastDriverMarketFetchLocation = { lat, lon };
}

export function getDriverMarketFetchLocation(): { lat: number; lon: number } | null {
  return lastDriverMarketFetchLocation;
}

export function clearDriverMarketFetchLocation(): void {
  lastDriverMarketFetchLocation = null;
}
