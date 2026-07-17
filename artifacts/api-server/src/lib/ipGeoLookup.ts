type GeoCacheEntry = {
  country: string | null;
  countryCode: string | null;
  isp: string | null;
  org: string | null;
  as: string | null;
  hosterLabel: string | null;
  fetchedAt: number;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, GeoCacheEntry>();

function hosterLabelFrom(org: string | null, isp: string | null, as: string | null): string {
  const parts = [org, isp, as].map((s) => (s ?? "").trim()).filter(Boolean);
  if (!parts.length) return "Unbekannt";
  const joined = parts.join(" · ");
  if (/bot|scan|hosting|cloud|datacenter|hetzner|ovh|digitalocean|amazon|google cloud|microsoft/i.test(joined)) {
    return joined.slice(0, 120);
  }
  return joined.slice(0, 120);
}

export type IpGeoInfo = {
  ip: string;
  country: string | null;
  countryCode: string | null;
  isp: string | null;
  org: string | null;
  as: string | null;
  hosterLabel: string | null;
  lookupOk: boolean;
};

export async function lookupIpGeo(ip: string): Promise<IpGeoInfo> {
  const normalized = ip.trim();
  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ip: normalized,
      country: cached.country,
      countryCode: cached.countryCode,
      isp: cached.isp,
      org: cached.org,
      as: cached.as,
      hosterLabel: cached.hosterLabel,
      lookupOk: true,
    };
  }

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,message,country,countryCode,isp,org,as,query`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      return {
        ip: normalized,
        country: null,
        countryCode: null,
        isp: null,
        org: null,
        as: null,
        hosterLabel: null,
        lookupOk: false,
      };
    }
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      countryCode?: string;
      isp?: string;
      org?: string;
      as?: string;
    };
    if (data.status !== "success") {
      return {
        ip: normalized,
        country: null,
        countryCode: null,
        isp: null,
        org: null,
        as: null,
        hosterLabel: null,
        lookupOk: false,
      };
    }
    const entry: GeoCacheEntry = {
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      isp: data.isp ?? null,
      org: data.org ?? null,
      as: data.as ?? null,
      hosterLabel: hosterLabelFrom(data.org ?? null, data.isp ?? null, data.as ?? null),
      fetchedAt: Date.now(),
    };
    cache.set(normalized, entry);
    return { ip: normalized, ...entry, lookupOk: true };
  } catch {
    return {
      ip: normalized,
      country: null,
      countryCode: null,
      isp: null,
      org: null,
      as: null,
      hosterLabel: null,
      lookupOk: false,
    };
  }
}

export async function lookupIpGeoBatch(ips: string[], max = 40): Promise<Map<string, IpGeoInfo>> {
  const unique = [...new Set(ips.map((ip) => ip.trim()).filter(Boolean))].slice(0, max);
  const out = new Map<string, IpGeoInfo>();
  for (const ip of unique) {
    out.set(ip, await lookupIpGeo(ip));
    await new Promise((r) => setTimeout(r, 60));
  }
  return out;
}
