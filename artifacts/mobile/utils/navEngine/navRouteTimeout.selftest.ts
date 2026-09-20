/**
 * navRouteTimeout — hängender nav-route-Request wird nach Timeout abgebrochen.
 *   npx tsx artifacts/mobile/utils/navEngine/navRouteTimeout.selftest.ts
 */
import { NAV_ROUTE_TIMEOUT_ERROR, withNavRouteTimeout } from "./navRouteTimeout";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  // 1) Schneller Erfolg: Wert durchgereicht, Signal nicht abgebrochen.
  {
    let sig: AbortSignal | null = null;
    const v = await withNavRouteTimeout(200, async (signal) => {
      sig = signal;
      return 42;
    });
    assert(v === 42, "fast: value");
    assert(sig != null && !(sig as AbortSignal).aborted, "fast: not aborted");
  }

  // 2) Hängender fetch, der das Signal respektiert → nav_route_timeout + abort.
  {
    let sig: AbortSignal | null = null;
    const t0 = Date.now();
    let err: (Error & { routingSource?: string }) | null = null;
    try {
      await withNavRouteTimeout(60, (signal) => {
        sig = signal;
        return new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("AbortError")));
        });
      });
    } catch (e) {
      err = e as Error & { routingSource?: string };
    }
    assert(err != null && err.message === NAV_ROUTE_TIMEOUT_ERROR, "abortable: timeout error");
    assert(err!.routingSource === "error", "abortable: routingSource error");
    assert(sig != null && (sig as AbortSignal).aborted, "abortable: signal aborted");
    assert(Date.now() - t0 < 1000, "abortable: returned promptly");
  }

  // 3) Hängender Request, der das Signal IGNORIERT (z. B. res.json() hängt) → trotzdem Timeout.
  {
    let err: Error | null = null;
    try {
      await withNavRouteTimeout(60, () => new Promise<never>(() => {}));
    } catch (e) {
      err = e as Error;
    }
    assert(err != null && err.message === NAV_ROUTE_TIMEOUT_ERROR, "ignoring-signal: timeout error");
  }

  // 4) Echter Fehler vor Timeout bleibt unverändert (kein Umetikettieren).
  {
    let err: Error | null = null;
    try {
      await withNavRouteTimeout(200, async () => {
        throw new Error("http_500");
      });
    } catch (e) {
      err = e as Error;
    }
    assert(err != null && err.message === "http_500", "passthrough: original error kept");
  }

  // 5) Timer wird nach Erfolg geräumt: kein späterer Abort/Unhandled Rejection.
  {
    let sig: AbortSignal | null = null;
    await withNavRouteTimeout(40, async (signal) => {
      sig = signal;
      return "ok";
    });
    await new Promise((r) => setTimeout(r, 120));
    assert(!(sig as unknown as AbortSignal).aborted, "cleanup: timer cleared after success");
  }

  console.log("navRouteTimeout.selftest: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
