/** Push-Tap / Foreground-Push → Markt nachladen ohne enge Kopplung an expo-router. */
let refreshHandler: (() => void) | null = null;

export function setDriverPushMarketRefreshHandler(handler: (() => void) | null): void {
  refreshHandler = handler;
}

export function requestDriverPushMarketRefresh(): void {
  refreshHandler?.();
}
