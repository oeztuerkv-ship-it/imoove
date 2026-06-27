import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DEFAULT_NETDATA_URL = "http://127.0.0.1:19999";
const DEFAULT_PM2_APPS = ["onroda-api", "onroda-partner-panel"];
const FETCH_TIMEOUT_MS = 4_000;

export type ResourceAmpel = "ok" | "warn" | "alert";

export type ServerStatusSnapshot = {
  fetchedAt: string;
  netdata: {
    reachable: boolean;
    baseUrl: string;
    version: string | null;
    error: string | null;
  };
  cpu: {
    percentUsed: number | null;
    ampel: ResourceAmpel;
  };
  ram: {
    usedBytes: number | null;
    totalBytes: number | null;
    percentUsed: number | null;
    ampel: ResourceAmpel;
  };
  disk: {
    mount: string | null;
    usedBytes: number | null;
    totalBytes: number | null;
    percentUsed: number | null;
    ampel: ResourceAmpel;
  };
  processes: Array<{
    name: string;
    status: "online" | "offline" | "stopped" | "unknown";
    uptimeMs: number | null;
    restartCount: number | null;
    ampel: ResourceAmpel;
  }>;
  warnings: string[];
};

function netdataBaseUrl(): string {
  return (process.env.NETDATA_URL ?? DEFAULT_NETDATA_URL).replace(/\/+$/, "");
}

function monitoredPm2Apps(): string[] {
  const raw = (process.env.ONRODA_PM2_APPS ?? "").trim();
  if (raw) {
    return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  }
  return [...DEFAULT_PM2_APPS];
}

function ampelForPercent(percent: number | null): ResourceAmpel {
  if (percent == null || !Number.isFinite(percent)) return "warn";
  if (percent >= 85) return "alert";
  if (percent >= 70) return "warn";
  return "ok";
}

function ampelForProcess(status: string): ResourceAmpel {
  if (status === "online") return "ok";
  if (status === "stopped") return "warn";
  return "alert";
}

async function fetchNetdataJson<T>(path: string): Promise<T> {
  const url = `${netdataBaseUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`netdata_http_${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type NetdataDataResponse = {
  labels?: string[];
  data?: number[][];
};

async function readNetdataChartPercentUsed(chart: string, idleDimension = "idle"): Promise<number | null> {
  const q = new URLSearchParams({
    chart,
    format: "json",
    points: "1",
    group: "average",
    options: "percentage",
    after: "-1",
  });
  const payload = await fetchNetdataJson<NetdataDataResponse>(`/api/v1/data?${q.toString()}`);
  const labels = payload.labels ?? [];
  const row = payload.data?.[0];
  if (!row?.length || labels.length !== row.length) return null;

  const idleIdx = labels.indexOf(idleDimension);
  if (idleIdx >= 0) {
    const idle = Number(row[idleIdx]);
    if (Number.isFinite(idle)) return Math.max(0, Math.min(100, 100 - idle));
  }

  let sum = 0;
  for (let i = 1; i < labels.length; i += 1) {
    const dim = labels[i] ?? "";
    if (dim === idleDimension) continue;
    const v = Number(row[i]);
    if (Number.isFinite(v)) sum += v;
  }
  return Math.max(0, Math.min(100, sum));
}

async function readNetdataRam(): Promise<{ usedBytes: number | null; totalBytes: number | null; percentUsed: number | null }> {
  const q = new URLSearchParams({
    chart: "system.ram",
    format: "json",
    points: "1",
    group: "average",
    after: "-1",
  });
  const payload = await fetchNetdataJson<NetdataDataResponse>(`/api/v1/data?${q.toString()}`);
  const labels = payload.labels ?? [];
  const row = payload.data?.[0];
  if (!row?.length) return { usedBytes: null, totalBytes: null, percentUsed: null };

  const readDim = (name: string): number => {
    const idx = labels.indexOf(name);
    if (idx < 0) return 0;
    const v = Number(row[idx]);
    return Number.isFinite(v) ? v : 0;
  };

  const usedMiB = readDim("used");
  const freeMiB = readDim("free");
  const cachedMiB = readDim("cached");
  const buffersMiB = readDim("buffers");
  const totalMiB = usedMiB + freeMiB + cachedMiB + buffersMiB;
  if (totalMiB <= 0) return { usedBytes: null, totalBytes: null, percentUsed: null };

  const usedBytes = Math.round(usedMiB * 1024 * 1024);
  const totalBytes = Math.round(totalMiB * 1024 * 1024);
  const percentUsed = Math.max(0, Math.min(100, (usedMiB / totalMiB) * 100));
  return { usedBytes, totalBytes, percentUsed };
}

type NetdataChartsResponse = {
  charts?: Record<string, { type?: string; family?: string; title?: string }>;
};

async function resolveRootDiskChart(): Promise<string | null> {
  const payload = await fetchNetdataJson<NetdataChartsResponse>("/api/v1/charts");
  const charts = payload.charts ?? {};
  const diskCharts = Object.keys(charts).filter((k) => k.startsWith("disk_space."));
  if (diskCharts.length === 0) return null;

  const preferred = [
    "disk_space._",
    "disk_space._root",
    "disk_space.root",
    "disk_space._var",
  ];
  for (const p of preferred) {
    if (diskCharts.includes(p)) return p;
  }
  return diskCharts[0] ?? null;
}

async function readNetdataDisk(): Promise<{
  mount: string | null;
  usedBytes: number | null;
  totalBytes: number | null;
  percentUsed: number | null;
}> {
  const chart = await resolveRootDiskChart();
  if (!chart) return { mount: null, usedBytes: null, totalBytes: null, percentUsed: null };

  const q = new URLSearchParams({
    chart,
    format: "json",
    points: "1",
    group: "average",
    after: "-1",
  });
  const payload = await fetchNetdataJson<NetdataDataResponse>(`/api/v1/data?${q.toString()}`);
  const labels = payload.labels ?? [];
  const row = payload.data?.[0];
  if (!row?.length) {
    return { mount: chart.replace(/^disk_space\./, "/"), usedBytes: null, totalBytes: null, percentUsed: null };
  }

  const readDim = (name: string): number => {
    const idx = labels.indexOf(name);
    if (idx < 0) return 0;
    const v = Number(row[idx]);
    return Number.isFinite(v) ? v : 0;
  };

  const availGiB = readDim("avail");
  const usedGiB = readDim("used");
  const totalGiB = availGiB + usedGiB;
  const mount = chart.replace(/^disk_space\./, "/").replace(/_/g, "/");
  if (totalGiB <= 0) {
    return { mount, usedBytes: null, totalBytes: null, percentUsed: null };
  }

  const usedBytes = Math.round(usedGiB * 1024 * 1024 * 1024);
  const totalBytes = Math.round(totalGiB * 1024 * 1024 * 1024);
  const percentUsed = Math.max(0, Math.min(100, (usedGiB / totalGiB) * 100));
  return { mount, usedBytes, totalBytes, percentUsed };
}

type Pm2JsonRow = {
  name?: string;
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
  };
};

async function readPm2Processes(names: string[]): Promise<ServerStatusSnapshot["processes"]> {
  try {
    const { stdout } = await execAsync("pm2 jlist 2>/dev/null");
    const parsed = JSON.parse(stdout) as Pm2JsonRow[];
    const byName = new Map<string, Pm2JsonRow>();
    for (const row of parsed) {
      const n = row.name?.trim();
      if (n) byName.set(n, row);
    }

    return names.map((name) => {
      const row = byName.get(name);
      if (!row) {
        return {
          name,
          status: "offline" as const,
          uptimeMs: null,
          restartCount: null,
          ampel: "alert" as const,
        };
      }
      const statusRaw = (row.pm2_env?.status ?? "unknown").toLowerCase();
      const status =
        statusRaw === "online"
          ? ("online" as const)
          : statusRaw === "stopped"
            ? ("stopped" as const)
            : ("unknown" as const);
      const uptimeMs =
        status === "online" && typeof row.pm2_env?.pm_uptime === "number"
          ? Math.max(0, Date.now() - row.pm2_env.pm_uptime)
          : null;
      const restartCount =
        typeof row.pm2_env?.restart_time === "number" ? row.pm2_env.restart_time : null;
      return {
        name,
        status,
        uptimeMs,
        restartCount,
        ampel: ampelForProcess(status),
      };
    });
  } catch {
    return names.map((name) => ({
      name,
      status: "unknown" as const,
      uptimeMs: null,
      restartCount: null,
      ampel: "alert" as const,
    }));
  }
}

export async function collectServerStatusSnapshot(): Promise<ServerStatusSnapshot> {
  const warnings: string[] = [];
  const fetchedAt = new Date().toISOString();
  const baseUrl = netdataBaseUrl();

  let netdataVersion: string | null = null;
  let netdataReachable = false;
  let netdataError: string | null = null;

  let cpuPercent: number | null = null;
  let ram = { usedBytes: null as number | null, totalBytes: null as number | null, percentUsed: null as number | null };
  let disk = {
    mount: null as string | null,
    usedBytes: null as number | null,
    totalBytes: null as number | null,
    percentUsed: null as number | null,
  };

  try {
    const info = await fetchNetdataJson<{ version?: string }>("/api/v1/info");
    netdataReachable = true;
    netdataVersion = typeof info.version === "string" ? info.version : null;

    cpuPercent = await readNetdataChartPercentUsed("system.cpu");
    ram = await readNetdataRam();
    disk = await readNetdataDisk();
  } catch (e) {
    netdataError = e instanceof Error ? e.message : "netdata_unreachable";
    warnings.push("Netdata nicht erreichbar — CPU/RAM/Festplatte nicht verfügbar.");
  }

  const pm2Names = monitoredPm2Apps();
  const processes = await readPm2Processes(pm2Names);
  if (processes.every((p) => p.status === "unknown" && p.restartCount == null)) {
    warnings.push("PM2-Status nicht lesbar — Prozessliste leer oder pm2 nicht installiert.");
  }

  return {
    fetchedAt,
    netdata: {
      reachable: netdataReachable,
      baseUrl,
      version: netdataVersion,
      error: netdataError,
    },
    cpu: {
      percentUsed: cpuPercent,
      ampel: ampelForPercent(cpuPercent),
    },
    ram: {
      usedBytes: ram.usedBytes,
      totalBytes: ram.totalBytes,
      percentUsed: ram.percentUsed,
      ampel: ampelForPercent(ram.percentUsed),
    },
    disk: {
      mount: disk.mount,
      usedBytes: disk.usedBytes,
      totalBytes: disk.totalBytes,
      percentUsed: disk.percentUsed,
      ampel: ampelForPercent(disk.percentUsed),
    },
    processes,
    warnings,
  };
}
