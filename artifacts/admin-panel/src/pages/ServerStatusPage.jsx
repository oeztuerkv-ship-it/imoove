import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const STATUS_URL = `${API_BASE}/admin/server-status`;
const POLL_MS = 10_000;

function ampelClass(ampel) {
  if (ampel === "ok") return "admin-dashboard__tile-btn--ampel-ok";
  if (ampel === "warn") return "admin-dashboard__tile-btn--ampel-warn";
  return "admin-dashboard__tile-btn--ampel-alert";
}

function ampelEmoji(ampel) {
  if (ampel === "ok") return "🟢";
  if (ampel === "warn") return "🟡";
  return "🔴";
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1).replace(".", ",")} %`;
}

function formatDeInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("de-DE").format(v);
}

function formatMoneyEUR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatBytesGiB(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const gib = n / (1024 * 1024 * 1024);
  if (gib >= 10) return `${gib.toFixed(0)} GB`;
  return `${gib.toFixed(1).replace(".", ",")} GB`;
}

function formatBytesPair(usedBytes, totalBytes) {
  const used = formatBytesGiB(usedBytes);
  const total = formatBytesGiB(totalBytes);
  if (used === "—" || total === "—") return "—";
  return `${used} / ${total}`;
}

function formatKbps(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} Gbit/s`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} Mbit/s`;
  return `${Math.round(n)} kbit/s`;
}

function formatKibPerSec(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} GiB/s`;
  if (n >= 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} MiB/s`;
  return `${Math.round(n)} KiB/s`;
}

function formatLoad(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2).replace(".", ",");
}

function formatUptime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const sec = Math.floor(n / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days} T ${hours} Std`;
  if (hours > 0) return `${hours} Std ${mins} Min`;
  return `${mins} Min`;
}

function formatFetchedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatChartTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Date(n * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function processStatusLabel(status) {
  if (status === "online") return "Online";
  if (status === "stopped") return "Gestoppt";
  if (status === "offline") return "Nicht gefunden";
  return "Unbekannt";
}

function DualSparkline({ history, label }) {
  const { receivedMax, sentMax, cols } = useMemo(() => {
    const rows = Array.isArray(history) ? history : [];
    let rMax = 1;
    let sMax = 1;
    for (const row of rows) {
      rMax = Math.max(rMax, Number(row.receivedKbps ?? 0));
      sMax = Math.max(sMax, Number(row.sentKbps ?? 0));
    }
    return { receivedMax: rMax, sentMax: sMax, cols: rows };
  }, [history]);

  if (!cols.length) {
    return <p className="admin-m-muted">Keine Verlaufsdaten (letzte Stunde).</p>;
  }

  return (
    <div className="server-status-chart" role="img" aria-label={label}>
      <div className="server-status-chart__legend">
        <span><i className="server-status-chart__dot server-status-chart__dot--in" /> Empfang</span>
        <span><i className="server-status-chart__dot server-status-chart__dot--out" /> Sendung</span>
      </div>
      <div className="server-status-chart__rows">
        <div className="server-status-chart__row">
          <span className="server-status-chart__row-label">↓</span>
          <div className="server-status-chart__bars">
            {cols.map((row, idx) => {
              const val = Number(row.receivedKbps ?? 0);
              const h = Math.max(2, Math.round((val / receivedMax) * 100));
              return (
                <div
                  key={`in-${row.ts ?? idx}`}
                  className="server-status-chart__col"
                  title={`${formatChartTime(row.ts)} · ${formatKbps(val)}`}
                >
                  <div className="server-status-chart__bar server-status-chart__bar--in" style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="server-status-chart__row">
          <span className="server-status-chart__row-label">↑</span>
          <div className="server-status-chart__bars">
            {cols.map((row, idx) => {
              const val = Number(row.sentKbps ?? 0);
              const h = Math.max(2, Math.round((val / sentMax) * 100));
              return (
                <div
                  key={`out-${row.ts ?? idx}`}
                  className="server-status-chart__col"
                  title={`${formatChartTime(row.ts)} · ${formatKbps(val)}`}
                >
                  <div className="server-status-chart__bar server-status-chart__bar--out" style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServerStatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (opts = { silent: false }) => {
    if (!opts.silent) setLoading(true);
    setError("");
    try {
      const res = await adminFetch(STATUS_URL);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data.status ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      if (!opts.silent) setStatus(null);
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    pollRef.current = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  const cpu = status?.cpu;
  const ram = status?.ram;
  const disk = status?.disk;
  const network = status?.network;
  const diskIo = status?.diskIo;
  const loadAvg = status?.load;
  const postgres = status?.postgres;
  const business = status?.business;
  const processes = Array.isArray(status?.processes) ? status.processes : [];
  const warnings = Array.isArray(status?.warnings) ? status.warnings : [];

  return (
    <div className="admin-page-stack">
      <div className="admin-section-block">
        <div className="admin-m-page-head">
          <div>
            <p className="admin-m-kicker">Plattform · Infrastruktur</p>
            <h2 className="admin-m-page-title">Server-Status</h2>
            <p className="admin-m-page-lead">
              Server-Metriken (Netdata), PostgreSQL, PM2 und Live-Kennzahlen der Plattform.
              Aktualisierung alle {POLL_MS / 1000} Sekunden.
            </p>
          </div>
          <div className="admin-m-inline-actions">
            <button
              type="button"
              className="admin-btn-refresh"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Aktualisiere …" : "Aktualisieren"}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}
      {warnings.length > 0 ? (
        <div className="admin-info-banner">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      ) : null}

      {status?.netdata ? (
        <p className="admin-m-muted" style={{ marginTop: -8 }}>
          Netdata: {status.netdata.reachable ? `erreichbar (${status.netdata.version ?? "v?"})` : "nicht erreichbar"}
          {" · "}
          Zuletzt: {formatFetchedAt(status.fetchedAt)}
          {status.netdata.baseUrl ? ` · ${status.netdata.baseUrl}` : ""}
        </p>
      ) : null}

      <section className="admin-dashboard__operator" aria-labelledby="server-status-business">
        <h3 id="server-status-business" className="admin-dashboard__section-title" style={{ marginBottom: 12 }}>
          Plattform live
        </h3>
        <div className="admin-dashboard__grid">
          <article className="admin-dashboard__card admin-dashboard__tile-btn--ampel-ok">
            <div className="admin-dashboard__card-label">🚕 Aktive Fahrten</div>
            <div className="admin-dashboard__card-value">{formatDeInt(business?.activeRides)}</div>
            <div className="admin-dashboard__card-sub">Status: searching_driver, in_progress</div>
          </article>
          <article className="admin-dashboard__card admin-dashboard__tile-btn--ampel-ok">
            <div className="admin-dashboard__card-label">👤 Online-Fahrer</div>
            <div className="admin-dashboard__card-value">{formatDeInt(business?.onlineDrivers)}</div>
            <div className="admin-dashboard__card-sub">Heartbeat ≤ 120 s · alle Mandanten</div>
          </article>
          <article className="admin-dashboard__card admin-dashboard__tile-btn--ampel-ok">
            <div className="admin-dashboard__card-label">✅ Heute abgeschlossen</div>
            <div className="admin-dashboard__card-value">{formatDeInt(business?.todayCompletedRides)}</div>
            <div className="admin-dashboard__card-sub">Europe/Berlin · Kalendertag</div>
          </article>
          <article className="admin-dashboard__card admin-dashboard__tile-btn--ampel-ok">
            <div className="admin-dashboard__card-label">💶 Umsatz heute</div>
            <div className="admin-dashboard__card-value" style={{ fontSize: "1.5rem" }}>
              {formatMoneyEUR(business?.todayRevenueEur)}
            </div>
            <div className="admin-dashboard__card-sub">Abgeschlossene Fahrten · Brutto (final/estimated)</div>
          </article>
        </div>
      </section>

      <section className="admin-dashboard__operator" aria-labelledby="server-status-metrics" style={{ marginTop: 8 }}>
        <h3 id="server-status-metrics" className="admin-dashboard__section-title" style={{ marginBottom: 12 }}>
          System-Ressourcen
        </h3>
        <div className="admin-dashboard__grid">
          <article className={`admin-dashboard__card ${ampelClass(cpu?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">{ampelEmoji(cpu?.ampel)} CPU-Auslastung</div>
            <div className="admin-dashboard__card-value">{formatPercent(cpu?.percentUsed)}</div>
            <div className="admin-dashboard__card-sub">Netdata · system.cpu</div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(ram?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">{ampelEmoji(ram?.ampel)} Arbeitsspeicher</div>
            <div className="admin-dashboard__card-value">{formatPercent(ram?.percentUsed)}</div>
            <div className="admin-dashboard__tile-metric">{formatBytesPair(ram?.usedBytes, ram?.totalBytes)}</div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(disk?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">
              {ampelEmoji(disk?.ampel)} Festplatte{disk?.mount ? ` (${disk.mount})` : ""}
            </div>
            <div className="admin-dashboard__card-value">{formatPercent(disk?.percentUsed)}</div>
            <div className="admin-dashboard__tile-metric">{formatBytesPair(disk?.usedBytes, disk?.totalBytes)}</div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(loadAvg?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">{ampelEmoji(loadAvg?.ampel)} Load Average</div>
            <div className="admin-dashboard__card-value" style={{ fontSize: "1.25rem" }}>
              {formatLoad(loadAvg?.load1)} / {formatLoad(loadAvg?.load5)} / {formatLoad(loadAvg?.load15)}
            </div>
            <div className="admin-dashboard__card-sub">1 / 5 / 15 Minuten</div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(postgres?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">{ampelEmoji(postgres?.ampel)} PostgreSQL</div>
            <div className="admin-dashboard__card-value">{formatDeInt(postgres?.totalConnections)}</div>
            <div className="admin-dashboard__tile-metric">
              aktiv: {formatDeInt(postgres?.activeConnections)} · idle: {formatDeInt(postgres?.idleConnections)}
              {postgres?.maxConnections != null ? ` · max ${formatDeInt(postgres.maxConnections)}` : ""}
            </div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(diskIo?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">{ampelEmoji(diskIo?.ampel)} Festplatten-I/O</div>
            <div className="admin-dashboard__card-value" style={{ fontSize: "1.1rem" }}>
              ↓ {formatKibPerSec(diskIo?.readKibPerSec)}
            </div>
            <div className="admin-dashboard__tile-metric">↑ {formatKibPerSec(diskIo?.writeKibPerSec)}</div>
          </article>
        </div>
      </section>

      <section className="admin-m-card admin-m-card--unified" aria-labelledby="server-status-network">
        <h3 id="server-status-network" className="admin-m-card__title">
          Netzwerk-Durchsatz (letzte Stunde)
        </h3>
        <p className="admin-m-muted">
          Aktuell: Empfang {formatKbps(network?.receivedKbps)} · Sendung {formatKbps(network?.sentKbps)}
        </p>
        <DualSparkline history={network?.historyLastHour} label="Netzwerk letzte Stunde" />
      </section>

      <section className="admin-dashboard__operator" aria-labelledby="server-status-pm2" style={{ marginTop: 8 }}>
        <h3 id="server-status-pm2" className="admin-dashboard__section-title" style={{ marginBottom: 12 }}>
          PM2-Prozesse
        </h3>
        {loading && !status ? (
          <p className="admin-m-muted">Lädt …</p>
        ) : processes.length === 0 ? (
          <p className="admin-m-muted">Keine überwachten PM2-Prozesse konfiguriert.</p>
        ) : (
          <div className="admin-dashboard__grid">
            {processes.map((proc) => (
              <article key={proc.name} className={`admin-dashboard__card ${ampelClass(proc.ampel)}`}>
                <div className="admin-dashboard__card-label">
                  {ampelEmoji(proc.ampel)} {proc.name}
                </div>
                <div className="admin-dashboard__card-value" style={{ fontSize: "1.35rem" }}>
                  {processStatusLabel(proc.status)}
                </div>
                <div className="admin-dashboard__tile-metric">
                  Uptime: {formatUptime(proc.uptimeMs)}
                  {" · "}
                  Neustarts: {proc.restartCount ?? "—"}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-m-card admin-m-card--unified" style={{ marginTop: 16 }}>
        <h3 className="admin-m-card__title">Ampel-Schwellen</h3>
        <p className="admin-m-muted">
          CPU/RAM/Festplatte/PostgreSQL: grün &lt; 70 %, gelb 70–85 %, rot ≥ 85 %. Load: gelb ab 4, rot ab 8.
          PM2: grün = online, rot = offline. API-Metriken (Anfragen/Fehler/Latenz) folgen in Phase 3.
        </p>
      </section>

      <style>{`
        .server-status-chart { margin-top: 12px; }
        .server-status-chart__legend {
          display: flex; gap: 16px; margin-bottom: 10px; font-size: 0.85rem; color: var(--onroda-text-muted, #64748b);
        }
        .server-status-chart__dot {
          display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px;
        }
        .server-status-chart__dot--in { background: #0ea5e9; }
        .server-status-chart__dot--out { background: #8b5cf6; }
        .server-status-chart__rows { display: flex; flex-direction: column; gap: 8px; }
        .server-status-chart__row { display: flex; align-items: stretch; gap: 8px; }
        .server-status-chart__row-label { width: 16px; font-weight: 700; color: #64748b; padding-top: 4px; }
        .server-status-chart__bars {
          flex: 1; display: flex; align-items: flex-end; gap: 2px; height: 72px;
          border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;
        }
        .server-status-chart__col { flex: 1; min-width: 2px; height: 100%; display: flex; align-items: flex-end; }
        .server-status-chart__bar {
          width: 100%; border-radius: 2px 2px 0 0; min-height: 2px;
        }
        .server-status-chart__bar--in { background: linear-gradient(180deg, #38bdf8, #0ea5e9); }
        .server-status-chart__bar--out { background: linear-gradient(180deg, #a78bfa, #8b5cf6); }
      `}</style>
    </div>
  );
}
