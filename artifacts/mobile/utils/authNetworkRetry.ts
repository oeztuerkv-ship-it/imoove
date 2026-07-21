/**
 * Auth-Netzwerk: Timeout + begrenzte Retries bei transienten Fehlern
 * (hängende Login-Flows nach Apple-/Google-Bestätigung).
 */

export const AUTH_FETCH_TIMEOUT_MS = 12_000;
export const AUTH_FETCH_MAX_ATTEMPTS = 3;

export function isAuthAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export function isRetryableAuthNetworkError(err: unknown): boolean {
  if (isAuthAbortError(err)) return true;
  if (err instanceof TypeError) {
    const msg = (err.message ?? "").toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    );
  }
  return false;
}

export function isRetryableAuthHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function fetchWithAuthTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch mit Timeout; bei Abort/Netzwerk/5xx/429 automatisch erneut (max. attempts).
 * Kein Retry bei 4xx (außer 408/425/429).
 */
export async function fetchAuthWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts?: { timeoutMs?: number; maxAttempts?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? AUTH_FETCH_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? AUTH_FETCH_MAX_ATTEMPTS);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithAuthTimeout(input, init, timeoutMs);
      if (attempt < maxAttempts && isRetryableAuthHttpStatus(res.status)) {
        await sleep(350 * attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryableAuthNetworkError(err)) {
        throw err;
      }
      await sleep(350 * attempt);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("auth_network_failed");
}

export function mapAuthNetworkFailure(err: unknown, label: string): string {
  if (isAuthAbortError(err)) {
    return `${label}: Zeitüberschreitung — bitte erneut versuchen.`;
  }
  if (isRetryableAuthNetworkError(err)) {
    return `${label}: Netzwerkproblem — bitte Verbindung prüfen und erneut versuchen.`;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return `${label} fehlgeschlagen.`;
}
