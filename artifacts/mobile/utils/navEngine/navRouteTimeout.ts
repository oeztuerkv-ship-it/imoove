/**
 * Timeout-Wrapper für Navi-Route-Requests (RN-frei, per tsx testbar).
 *
 * Ohne Timeout blieb ein hängender nav-route-Request ewig „inFlight“ → kein
 * Off-Route-Reroute, Guidance dauerhaft stale. Der Wrapper bricht per AbortSignal
 * ab UND rejected selbst per Race, falls `run` das Signal ignoriert (z. B. hängendes
 * `res.json()`).
 */

export const NAV_ROUTE_TIMEOUT_ERROR = "nav_route_timeout";

export async function withNavRouteTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(
        Object.assign(new Error(NAV_ROUTE_TIMEOUT_ERROR), { routingSource: "error" as const }),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } catch (e) {
    // Abort durch fetch selbst (AbortError) nach Timeout → einheitlicher Fehler.
    if (ctrl.signal.aborted && !(e instanceof Error && e.message === NAV_ROUTE_TIMEOUT_ERROR)) {
      throw Object.assign(new Error(NAV_ROUTE_TIMEOUT_ERROR), { routingSource: "error" as const });
    }
    throw e;
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
