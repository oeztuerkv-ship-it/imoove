/**
 * Rückkehr von openAuthSessionAsync: Parameter können in ?query oder #fragment stehen (u. a. Expo-Proxy).
 */
export function readOAuthReturnParams(url: string): {
  error: string | null;
  result: string | null;
  token: string | null;
  detail: string | null;
} {
  const fromSearchParams = (raw: string) => {
    const s = raw.startsWith("?") || raw.startsWith("#") ? raw.slice(1) : raw;
    const p = new URLSearchParams(s);
    return {
      error: p.get("error"),
      result: p.get("result"),
      token: p.get("token"),
      detail: p.get("detail"),
    };
  };

  const empty = { error: null, result: null, token: null, detail: null };

  try {
    const normalized = url.includes("://") && !/^https?:\/\//i.test(url)
      ? url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "https://")
      : url;
    if (/^https?:\/\//i.test(normalized)) {
      const u = new URL(normalized);
      const q = fromSearchParams(u.search);
      if (q.error || q.result || q.token || q.detail) return q;
      if (u.hash.length > 1) return fromSearchParams(u.hash);
      return empty;
    }
  } catch {
    /* custom scheme: unten parsen */
  }

  const qIdx = url.indexOf("?");
  const hIdx = url.indexOf("#");
  if (qIdx >= 0) {
    const out = fromSearchParams(url.slice(qIdx));
    if (out.error || out.result || out.token || out.detail) return out;
  }
  if (hIdx >= 0) return fromSearchParams(url.slice(hIdx));
  return empty;
}
