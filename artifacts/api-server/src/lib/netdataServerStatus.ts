import { exec } from "child_process";
import { promisify } from "util";
import { collectAdminLiveBusinessMetrics, type AdminLiveBusinessSnapshot } from "./adminServerLiveMetrics";
import { readPostgresConnectionStats, type PostgresConnectionSnapshot } from "./postgresServerStatus";

const execAsync = promisify(exec);

const DEFAULT_NETDATA_URL = "http://127.0.0.1:19999";
const DEFAULT_PM2_APPS = ["onroda-api", "onroda-partner-panel"];
const FETCH_TIMEOUT_MS = 6_000;
const HISTORY_POINTS = 60;
const HISTORY_AFTER_SECONDS = 3600;

export type ResourceAmpel = "ok" | "warn" | "alert";

export type MetricHistoryPoint = {
  ts: number;
  receivedKbps: number | null;
  sentKbps: number | null;
};

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
  network: {
    receivedKbps: number | null;
    sentKbps: number | null;
    historyLastHour: MetricHistoryPoint[];
    ampel: ResourceAmpel;
  };
  diskIo: {
    readKibPerSec: number | null;
    writeKibPerSec: number | null;
    ampel: ResourceAmpel;
  };
  load: {
    load1: number | null;
    load5: number | null;
    load15: number | null;
    ampel: ResourceAmpel;
  };
  postgres: PostgresConnectionSnapshot;
  business: AdminLiveBusinessSnapshot;
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

export function ampelForPercent(percent: number | null): ResourceAmpel {
  if (percent == null || !Number.isFinite(percent)) return "warn";
  if (percent >= 85) return "alert";
  if (percent >= 70) return "warn";
  return "ok";
}

function ampelForLoad(load1: number | null): ResourceAmpel {
  if (load1 == null || !Number.isFinite(load1)) return "warn";
  if (load1 >= 8) return "alert";
  if (load1 >= 4) return "warn";
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

type NetdataChartsResponse = {
  charts?: Record<string, { type?: string; family?: string; title?: string }>;
};

async function resolveChart(preferred: string[], prefix: string): Promise<string | null> {
  for (const p of preferred) {
    try {
      await fetchNetdataJson<NetdataDataResponse>(
        `/api/v1/data?${new URLSearchParams({ chart: p, format: "json", points: "1", after: "-1" }).toString()}`,
      );
      return p;
    } catch {
      /* try next */
    }
  }
  try {
    const payload = await fetchNetdataJson<NetdataChartsResponse>("/api/v1/charts");
    const charts = Object.keys(payload.charts ?? {}).filter((k) => k.startsWith(prefix));
    return charts[0] ?? null;
  } catch {
    return null;
  }
}

function readDim(row: number[], labels: string[], name: string): number {
  const idx = labels.indexOf(name);
  if (idx < 0) return 0;
  const v = Number(row[idx]);
  return Number.isFinite(v) ? v : 0;
}

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

async function readNetdataChartLatest(chart: string): Promise<{ labels: string[]; values: Record<string, number> } | null> {
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
  if (!row?.length) return null;
  const values: Record<string, number> = {};
  for (let i = 1; i < labels.length; i += 1) {
    const label = labels[i];
    if (!label) continue;
    values[label] = readDim(row, labels, label);
  }
  return { labels, values };
}

async function readNetdataNetworkHistory(
  chart: string,
): Promise<{ receivedKbps: number | null; sentKbps: number | null; history: MetricHistoryPoint[] }> {
  const q = new URLSearchParams({
    chart,
    format: "json",
    points: String(HISTORY_POINTS),
    group: "average",
    after: String(-HISTORY_AFTER_SECONDS),
  });
  const payload = await fetchNetdataJson<NetdataDataResponse>(`/api/v1/data?${q.toString()}`);
  const labels = payload.labels ?? [];
  const rows = payload.data ?? [];
  const history: MetricHistoryPoint[] = rows.map((row) => {
    const received = readDim(row, labels, "received");
    const sent = readDim(row, labels, "sent");
    return {
      ts: Number(row[0] ?? 0),
      receivedKbps: Number.isFinite(received) ? received : null,
      sentKbps: Number.isFinite(sent) ? sent : null,
    };
  });

  const last = history[history.length - 1];
  return {
    receivedKbps: last?.receivedKbps ?? null,
    sentKbps: last?.sentKbps ?? null,
    history,
  };
}

async function readNetdataRam(): Promise<{ usedBytes: number | null; totalBytes: number | null; percentUsed: number | null }> {
  const latest = await readNetdataChartLatest("system.ram");
  if (!latest) return { usedBytes: null, totalBytes: null, percentUsed: null };

  const usedMiB = latest.values.used ?? 0;
  const freeMiB = latest.values.free ?? 0;
  const cachedMiB = latest.values.cached ?? 0;
  const buffersMiB = latest.values.buffers ?? 0;
  const totalMiB = usedMiB + freeMiB + cachedMiB + buffersMiB;
  if (totalMiB <= 0) return { usedBytes: null, totalBytes: null, percentUsed: null };

  return {
    usedBytes: Math.round(usedMiB * 1024 * 1024),
    totalBytes: Math.round(totalMiB * 1024 * 1024),
    percentUsed: Math.max(0, Math.min(100, (usedMiB / totalMiB) * 100)),
  };
}

async function resolveRootDiskChart(): Promise<string | null> {
  const payload = await fetchNetdataJson<NetdataChartsResponse>("/api/v1/charts");
  const diskCharts = Object.keys(payload.charts ?? {}).filter((k) => k.startsWith("disk_space."));
  if (diskCharts.length === 0) return null;

  const preferred = ["disk_space._", "disk_space._root", "disk_space.root", "disk_space._var"];
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

  const latest = await readNetdataChartLatest(chart);
  if (!latest) {
    return { mount: chart.replace(/^disk_space\./, "/"), usedBytes: null, totalBytes: null, percentUsed: null };
  }

  const availGiB = latest.values.avail ?? 0;
  const usedGiB = latest.values.used ?? 0;
  const totalGiB = availGiB + usedGiB;
  const mount = chart.replace(/^disk_space\./, "/").replace(/_/g, "/");
  if (totalGiB <= 0) {
    return { mount, usedBytes: null, totalBytes: null, percentUsed: null };
  }

  return {
    mount,
    usedBytes: Math.round(usedGiB * 1024 * 1024 * 1024),
    totalBytes: Math.round(totalGiB * 1024 * 1024 * 1024),
    percentUsed: Math.max(0, Math.min(100, (usedGiB / totalGiB) * 100)),
  };
}

async function readNetdataLoad(): Promise<{ load1: number | null; load5: number | null; load15: number | null }> {
  const latest = await readNetdataChartLatest("system.load");
  if (!latest) return { load1: null, load5: null, load15: null };
  return {
    load1: latest.values.load1 ?? latest.values["1"] ?? null,
    load5: latest.values.load5 ?? latest.values["5"] ?? null,
    load15: latest.values.load15 ?? latest.values["15"] ?? null,
  };
}

async function readNetdataDiskIo(): Promise<{ readKibPerSec: number | null; writeKibPerSec: number | null }> {
  const chart =
    (await resolveChart(["system.io", "disk.io", "disk_ops.io"], "system.")) ??
    (await resolveChart([], "disk."));
  if (!chart) return { readKibPerSec: null, writeKibPerSec: null };

  const latest = await readNetdataChartLatest(chart);
  if (!latest) return { readKibPerSec: null, writeKibPerSec: null };

  const readKibPerSec =
    latest.values.reads ??
    latest.values.read ??
    latest.values["in"] ??
    null;
  const writeKibPerSec =
    latest.values.writes ??
    latest.values.write ??
    latest.values["out"] ??
    null;

  return { readKibPerSec, writeKibPerSec };
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

async function collectNetdataInfrastructure(): Promise<{
  netdataVersion: string | null;
  netdataReachable: boolean;
  netdataError: string | null;
  cpuPercent: number | null;
  ram: Awaited<ReturnType<typeof readNetdataRam>>;
  disk: Awaited<ReturnType<typeof readNetdataDisk>>;
  network: Awaited<ReturnType<typeof readNetdataNetworkHistory>>;
  diskIo: Awaited<ReturnType<typeof readNetdataDiskIo>>;
  load: Awaited<ReturnType<typeof readNetdataLoad>>;
}> {
  const info = await fetchNetdataJson<{ version?: string }>("/api/v1/info");
  const networkChart = await resolveChart(["system.net", "net.eth0", "net.en0"], "net.");
  const [cpuPercent, ram, disk, network, diskIo, load] = await Promise.all([
    readNetdataChartPercentUsed("system.cpu"),
    readNetdataRam(),
    readNetdataDisk(),
    networkChart ? readNetdataNetworkHistory(networkChart) : Promise.resolve({ receivedKbps: null, sentKbps: null, history: [] }),
    readNetdataDiskIo(),
    readNetdataLoad(),
  ]);

  return {
    netdataVersion: typeof info.version === "string" ? info.version : null,
    netdataReachable: true,
    netdataError: null,
    cpuPercent,
    ram,
    disk,
    network,
    diskIo,
    load,
  };
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
  let network = { receivedKbps: null as number | null, sentKbps: null as number | null, history: [] as MetricHistoryPoint[] };
  let diskIo = { readKibPerSec: null as number | null, writeKibPerSec: null as number | null };
  let load = { load1: null as number | null, load5: null as number | null, load15: null as number | null };

  try {
    const infra = await collectNetdataInfrastructure();
    netdataReachable = infra.netdataReachable;
    netdataVersion = infra.netdataVersion;
    cpuPercent = infra.cpuPercent;
    ram = infra.ram;
    disk = infra.disk;
    network = infra.network;
    diskIo = infra.diskIo;
    load = infra.load;
  } catch (e) {
    netdataError = e instanceof Error ? e.message : "netdata_unreachable";
    warnings.push("Netdata nicht erreichbar — Server-Metriken eingeschränkt.");
  }

  const [postgres, business, processes] = await Promise.all([
    readPostgresConnectionStats(),
    collectAdminLiveBusinessMetrics(),
    readPm2Processes(monitoredPm2Apps()),
  ]);

  if (!postgres.available) {
    warnings.push("PostgreSQL-Verbindungsstatistik nicht verfügbar.");
  }
  if (!business.available) {
    warnings.push("Plattform-Live-Kennzahlen nicht verfügbar (Datenbank).");
  }
  if (processes.every((p) => p.status === "unknown" && p.restartCount == null)) {
    warnings.push("PM2-Status nicht lesbar — Prozessliste leer oder pm2 nicht installiert.");
  }

  const networkAmpel: ResourceAmpel =
    network.receivedKbps == null && network.sentKbps == null ? "warn" : "ok";

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
    network: {
      receivedKbps: network.receivedKbps,
      sentKbps: network.sentKbps,
      historyLastHour: network.history,
      ampel: networkAmpel,
    },
    diskIo: {
      readKibPerSec: diskIo.readKibPerSec,
      writeKibPerSec: diskIo.writeKibPerSec,
      ampel: diskIo.readKibPerSec == null && diskIo.writeKibPerSec == null ? "warn" : "ok",
    },
    load: {
      load1: load.load1,
      load5: load.load5,
      load15: load.load15,
      ampel: ampelForLoad(load.load1),
    },
    postgres,
    business,
    processes,
    warnings,
  };
}
