import { useCallback, useEffect, useRef, useState } from "react";
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

function processStatusLabel(status) {
  if (status === "online") return "Online";
  if (status === "stopped") return "Gestoppt";
  if (status === "offline") return "Nicht gefunden";
  return "Unbekannt";
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
              Live-Metriken aus Netdata (CPU, RAM, Festplatte) und PM2-Prozessstatus des Produktionsservers.
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

      <section className="admin-dashboard__operator" aria-labelledby="server-status-metrics">
        <h3 id="server-status-metrics" className="admin-dashboard__section-title" style={{ marginBottom: 12 }}>
          System-Ressourcen
        </h3>
        <div className="admin-dashboard__grid">
          <article className={`admin-dashboard__card ${ampelClass(cpu?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">
              {ampelEmoji(cpu?.ampel)} CPU-Auslastung
            </div>
            <div className="admin-dashboard__card-value">{formatPercent(cpu?.percentUsed)}</div>
            <div className="admin-dashboard__card-sub">Quelle: Netdata · system.cpu</div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(ram?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">
              {ampelEmoji(ram?.ampel)} Arbeitsspeicher
            </div>
            <div className="admin-dashboard__card-value">{formatPercent(ram?.percentUsed)}</div>
            <div className="admin-dashboard__tile-metric">
              {formatBytesPair(ram?.usedBytes, ram?.totalBytes)}
            </div>
          </article>

          <article className={`admin-dashboard__card ${ampelClass(disk?.ampel ?? "warn")}`}>
            <div className="admin-dashboard__card-label">
              {ampelEmoji(disk?.ampel)} Festplatte{disk?.mount ? ` (${disk.mount})` : ""}
            </div>
            <div className="admin-dashboard__card-value">{formatPercent(disk?.percentUsed)}</div>
            <div className="admin-dashboard__tile-metric">
              {formatBytesPair(disk?.usedBytes, disk?.totalBytes)}
            </div>
          </article>
        </div>
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
          Grün unter 70 % Auslastung, gelb 70–85 %, rot ab 85 %. PM2: grün = online, rot = offline oder
          unbekannt.
        </p>
      </section>
    </div>
  );
}
