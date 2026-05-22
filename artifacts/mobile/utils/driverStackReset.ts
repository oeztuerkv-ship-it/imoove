/** Screens im Stack unter `app/driver/_layout.tsx` (ohne `driver/`-Prefix). */
export type DriverStackScreen =
  | "navigation"
  | "dashboard"
  | "login"
  | "change-password"
  | "inbox";

export type PendingDriverStackReset = {
  screen: DriverStackScreen;
  params?: Record<string, string>;
};

let pending: PendingDriverStackReset | null = null;
const listeners = new Set<() => void>();

export function requestDriverStackReset(
  screen: DriverStackScreen,
  params?: Record<string, string>,
): void {
  pending = { screen, params };
  for (const listener of listeners) listener();
}

export function peekDriverStackReset(): PendingDriverStackReset | null {
  return pending;
}

export function clearDriverStackReset(): void {
  pending = null;
}

export function subscribeDriverStackReset(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
