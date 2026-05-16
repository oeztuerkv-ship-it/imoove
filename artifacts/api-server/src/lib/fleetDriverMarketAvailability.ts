/**
 * In-RAM „Online am Markt“-Schalter pro Fleet-Fahrer (pro API-Prozess).
 * Persistenz über App-Neustart / Deploy: Fahrer muss erneut ONLINE schalten.
 */
const marketOnlineByDriverId = new Map<string, boolean>();

export function setFleetDriverMarketOnline(fleetDriverId: string, online: boolean): void {
  const id = fleetDriverId.trim();
  if (!id) return;
  marketOnlineByDriverId.set(id, online);
}

export function isFleetDriverMarketOnline(fleetDriverId: string): boolean {
  const id = fleetDriverId.trim();
  if (!id) return false;
  return marketOnlineByDriverId.get(id) === true;
}
