import type { Request } from "express";

export const HOMEPAGE_ANALYTICS_EVENT_TYPES = [
  "page_view",
  "cta_click",
  "contact_click",
  "app_download_click",
  "partner_interest_click",
] as const;

export type HomepageAnalyticsEventType = (typeof HOMEPAGE_ANALYTICS_EVENT_TYPES)[number];

const VISITOR_ID_RE = /^[a-f0-9-]{8,64}$/i;

export function parseHomepageAnalyticsEventType(raw: unknown): HomepageAnalyticsEventType | null {
  const s = String(raw ?? "").trim();
  return (HOMEPAGE_ANALYTICS_EVENT_TYPES as readonly string[]).includes(s)
    ? (s as HomepageAnalyticsEventType)
    : null;
}

export function parseAnonymousVisitorId(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!VISITOR_ID_RE.test(s)) return null;
  return s.slice(0, 64);
}

/** Pfad ohne Query/PII — max. 512 Zeichen. */
export function sanitizeAnalyticsPagePath(raw: unknown): string {
  let s = String(raw ?? "/").trim();
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.split("?")[0]?.split("#")[0] ?? "/";
  if (s.includes("..") || s.includes("//")) return "/";
  if (s.length > 512) s = s.slice(0, 512);
  return s || "/";
}

/** Referrer: nur Schema+Host+Pfad, keine Query. */
export function sanitizeAnalyticsReferrer(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const path = u.pathname.length > 200 ? u.pathname.slice(0, 200) : u.pathname;
    const out = `${u.protocol}//${u.host}${path}`;
    return out.length > 512 ? out.slice(0, 512) : out;
  } catch {
    return null;
  }
}

export function coarseDeviceTypeFromUserAgent(uaRaw: string | undefined): string {
  const ua = String(uaRaw ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet|playbook|silk/.test(ua) || (ua.includes("android") && !ua.includes("mobile"))) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "mobile";
  return "desktop";
}

export function coarseBrowserFromUserAgent(uaRaw: string | undefined): string {
  const ua = String(uaRaw ?? "");
  if (!ua) return "Unbekannt";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return "Sonstige";
}

/** Optional: Land aus CDN-Header (keine IP-Speicherung). */
export function optionalCountryFromRequest(req: Request): string | null {
  const raw =
    req.get("cf-ipcountry") ??
    req.get("CF-IPCountry") ??
    req.get("cloudfront-viewer-country") ??
    req.get("x-vercel-ip-country") ??
    "";
  const cc = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === "XX" || cc === "T1") return null;
  return cc;
}

export type HomepageAnalyticsRange = "7d" | "30d";

export function parseHomepageAnalyticsRange(raw: unknown): HomepageAnalyticsRange {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "30d" ? "30d" : "7d";
}

export function rangeStartDate(range: HomepageAnalyticsRange, now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  start.setDate(start.getDate() - (range === "30d" ? 29 : 6));
  return start;
}

export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export function daysAgoStart(days: number, now = new Date()): Date {
  const start = startOfToday(now);
  start.setDate(start.getDate() - (days - 1));
  return start;
}
