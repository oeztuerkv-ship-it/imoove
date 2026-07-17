import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const STATUS_URL = `${API_BASE}/admin/fail2ban/status`;
const STATS_URL = `${API_BASE}/admin/security/stats`;
const WHITELIST_URL = `${API_BASE}/admin/security/whitelist`;
const BLOCKLIST_URL = `${API_BASE}/admin/security/blocklist`;
const BULK_URL = `${API_BASE}/admin/security/bulk`;
const SYNC_URL = `${API_BASE}/admin/security/sync`;

function formatDeDay(iso) {
  if (!iso) return "—";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.`;
}

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function panelProtectionClass(status) {
  if (status === "ok") return "admin-c-badge--ok";
  if (status === "missing") return "admin-c-badge--err";
  return "admin-c-badge--warn";
}

function SimpleBanChart({ daily, valueKey = "bans" }) {
  const max = useMemo(() => {
    let m = 1;
    for (const row of daily || []) {
      m = Math.max(m, Number(row[valueKey] ?? 0));
    }
    return m;
  }, [daily, valueKey]);

  if (!daily?.length) {
    return <p className="admin-muted">Noch keine Ereignisse im gewählten Zeitraum.</p>;
  }

  return (
    <div className="hp-analytics-chart" role="img" aria-label="Sperren pro Tag">
      <div className="hp-analytics-chart__bars">
        {daily.map((row) => {
          const val = Number(row[valueKey] ?? 0);
          const h = Math.max(4, Math.round((val / max) * 100));
          return (
            <div key={row.date} className="hp-analytics-chart__col" title={`${row.date}: ${val}`}>
              <div className="hp-analytics-chart__bar" style={{ height: `${h}%` }} />
              <span className="hp-analytics-chart__label">{formatDeDay(row.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeoCell({ geo }) {
  if (!geo?.lookupOk) return <span className="admin-muted">—</span>;
  const country = geo.countryCode ? `${geo.country ?? "?"} (${geo.countryCode})` : geo.country ?? "—";
  return (
    <span title={geo.isp ?? ""}>
      {country}
      {geo.hosterLabel ? (
        <>
          <br />
          <span className="admin-muted">{geo.hosterLabel}</span>
        </>
      ) : null}
    </span>
  );
}

function TableEmpty({ loading, empty, emptyLabel }) {
  if (loading) {
    return (
      <div className="admin-section-block__inset">
        <p className="admin-muted">Wird geladen …</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="admin-section-block__inset">
        <div className="admin-info-banner admin-info-banner--inline">{emptyLabel}</div>
      </div>
    );
  }
  return null;
}

export default function Fail2BanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);
  const [statsDays, setStatsDays] = useState(14);
  const [statsDaily, setStatsDaily] = useState([]);

  const [banIp, setBanIp] = useState("");
  const [banJail, setBanJail] = useState("sshd");
  const [selected, setSelected] = useState(() => new Set());

  const [wlIp, setWlIp] = useState("");
  const [wlLabel, setWlLabel] = useState("");
  const [blIp, setBlIp] = useState("");
  const [blLabel, setBlLabel] = useState("");
  const [blReason, setBlReason] = useState("");
  const [busy, setBusy] = useState("");

  const jails = data?.jails ?? [];

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(STATUS_URL);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? "Laden fehlgeschlagen");
        return;
      }
      setData(json);
      if (json.jails?.length && !json.jails.some((j) => j.jail === banJail)) {
        setBanJail(json.jails[0].jail);
      }
      setStatsDaily(json.statsDaily ?? []);
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }, [banJail]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminFetch(`${STATS_URL}?days=${statsDays}`);
      const json = await res.json();
      if (json.ok) setStatsDaily(json.daily ?? []);
    } catch {
      /* ignore */
    }
  }, [statsDays]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const selectionKey = (ip, jail) => `${jail}::${ip}`;

  const toggleSelect = (ip, jail) => {
    const key = selectionKey(ip, jail);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allRows = useMemo(
    () =>
      jails.flatMap((j) =>
        (j.bannedIps ?? []).map((row) => ({
          ip: row.ip,
          jail: j.jail,
        })),
      ),
    [jails],
  );

  const toggleSelectAll = () => {
    if (selected.size >= allRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allRows.map((r) => selectionKey(r.ip, r.jail))));
    }
  };

  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const unban = async (ip, jail) => {
    setMsg("");
    setBusy(`${ip}-${jail}`);
    const json = await postJson(`${API_BASE}/admin/fail2ban/unban`, { ip, jail });
    setMsg(json.message ?? json.error ?? (json.ok ? "Entsperrt" : "Fehler"));
    setBusy("");
    void fetchStatus();
    void fetchStats();
  };

  const ban = async () => {
    if (!banIp.trim()) return;
    setMsg("");
    setBusy("ban");
    const json = await postJson(`${API_BASE}/admin/fail2ban/ban`, { ip: banIp.trim(), jail: banJail });
    setMsg(json.message ?? json.error ?? (json.ok ? "Gesperrt" : "Fehler"));
    setBanIp("");
    setBusy("");
    void fetchStatus();
    void fetchStats();
  };

  const bulkUnban = async () => {
    const items = [...selected].map((key) => {
      const [jail, ip] = key.split("::");
      return { ip, jail };
    });
    if (!items.length) return;
    setBusy("bulk");
    const json = await postJson(BULK_URL, { action: "unban", items });
    setMsg(json.ok ? `${json.okCount} von ${items.length} entsperrt` : json.error ?? "Bulk fehlgeschlagen");
    setSelected(new Set());
    setBusy("");
    void fetchStatus();
    void fetchStats();
  };

  const addWhitelist = async () => {
    if (!wlIp.trim()) return;
    setBusy("wl");
    const res = await fetch(WHITELIST_URL, {
      method: "POST",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ip: wlIp.trim(), label: wlLabel.trim() }),
    });
    const json = await res.json();
    setMsg(json.ok ? `Whitelist: ${wlIp.trim()}` : json.message ?? json.error ?? "Fehler");
    setWlIp("");
    setWlLabel("");
    setBusy("");
    void fetchStatus();
  };

  const removeWhitelist = async (id, ip) => {
    setBusy(id);
    const res = await fetch(`${WHITELIST_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminApiHeaders(),
    });
    const json = await res.json();
    setMsg(json.ok ? `${ip} von Whitelist entfernt` : json.error ?? "Fehler");
    setBusy("");
    void fetchStatus();
  };

  const addBlocklist = async () => {
    if (!blIp.trim()) return;
    setBusy("bl");
    const res = await fetch(BLOCKLIST_URL, {
      method: "POST",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ip: blIp.trim(), label: blLabel.trim(), reason: blReason.trim() }),
    });
    const json = await res.json();
    setMsg(json.ok ? `Permanent gesperrt: ${blIp.trim()}` : json.message ?? json.error ?? "Fehler");
    setBlIp("");
    setBlLabel("");
    setBlReason("");
    setBusy("");
    void fetchStatus();
    void fetchStats();
  };

  const removeBlocklist = async (id, ip) => {
    setBusy(id);
    const res = await fetch(`${BLOCKLIST_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminApiHeaders(),
    });
    const json = await res.json();
    setMsg(json.ok ? `${ip} von Blockliste entfernt` : json.error ?? "Fehler");
    setBusy("");
    void fetchStatus();
    void fetchStats();
  };

  const syncRules = async () => {
    setBusy("sync");
    const json = await postJson(SYNC_URL, {});
    setMsg(
      json.ok
        ? `Sync: Whitelist ${json.whitelist?.applied ?? 0}, Blockliste ${json.blocklist?.applied ?? 0}`
        : json.error ?? "Sync fehlgeschlagen",
    );
    setBusy("");
    void fetchStatus();
  };

  const panel = data?.panelLoginProtection;
  const incrementJails = (data?.jailConfigs ?? []).filter(
    (c) => c.bantimeIncrement && c.bantimeIncrement !== "0" && c.bantimeIncrement !== "false",
  );

  return (
    <div className="admin-page admin-page--loose">
      <p className="admin-page-lead">
        <strong>Plattform-Sicherheit</strong> — Fail2Ban-Jails, Team-Whitelist, permanente Sperren, Geo/Hoster und
        Panel-Login-Schutz.
      </p>

      {msg ? <div className="admin-success-banner">{msg}</div> : null}
      {error ? (
        <div className="admin-error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-stat-grid admin-stat-grid--wide">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Fail2Ban</div>
          <div className="admin-stat-value" style={{ fontSize: "1.15rem" }}>
            {loading ? "…" : data?.fail2banAvailable ? "Erreichbar" : "Offline"}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Permanenter Jail</div>
          <div className="admin-stat-value" style={{ fontSize: "1.05rem", wordBreak: "break-word" }}>
            {loading ? "…" : data?.permanentJail ?? "onroda-permanent"}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Panel-Login-Schutz</div>
          <div className="admin-stat-value" style={{ fontSize: "1rem", lineHeight: 1.35 }}>
            {loading ? (
              "…"
            ) : (
              <>
                <span className={`admin-c-badge ${panelProtectionClass(panel?.status)}`}>
                  {panel?.jail ?? "nginx-http-auth"}
                </span>
                <div className="admin-muted" style={{ marginTop: 6, fontWeight: 500 }}>
                  {panel?.currentBanned ?? 0} aktiv · {panel?.totalBanned ?? 0} gesamt
                </div>
              </>
            )}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gestaffelte Sperrzeit</div>
          <div className="admin-stat-value" style={{ fontSize: "1rem", lineHeight: 1.35 }}>
            {loading
              ? "…"
              : incrementJails.length
                ? `${incrementJails.length} Jail(s) aktiv`
                : "Nicht aktiv"}
          </div>
        </div>
      </div>

      {panel?.hint && !loading ? (
        <div className="admin-info-banner" style={{ marginBottom: 16 }}>
          {panel.hint}
        </div>
      ) : null}

      <AdminCollapsibleSection
        title="Aktionen"
        subtitle="Status neu laden, Regeln nach Fail2Ban spiegeln, Mehrfach-Entsperren"
        defaultOpen
        flushBody
      >
        <div className="admin-filter-toolbar admin-filter-toolbar--modern">
          <button
            type="button"
            className="admin-btn-primary admin-filter-toolbar--modern__refresh"
            onClick={() => void fetchStatus()}
            disabled={loading}
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
          <button type="button" className="admin-c-btn-sec" onClick={() => void syncRules()} disabled={!!busy}>
            Regeln synchronisieren
          </button>
          {selected.size > 0 ? (
            <button type="button" className="admin-m-btn-bearb" onClick={() => void bulkUnban()} disabled={!!busy}>
              {selected.size} ausgewählt — entsperren
            </button>
          ) : null}
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Whitelist — Team-IPs"
        subtitle="Schutz vor Selbstsperre · ignoreip auf alle Jails"
        defaultOpen
        flushBody
      >
        <div className="admin-section-block__inset">
          <p className="admin-muted" style={{ margin: 0 }}>
            Einträge werden in Fail2Ban als <code>ignoreip</code> angewendet. Whitelist-IPs können nicht gebannt werden.
          </p>
          <div className="admin-filter-toolbar admin-filter-toolbar--modern">
            <label className="admin-filter-field">
              <span className="admin-field-label">IP / CIDR</span>
              <input
                className="admin-input"
                value={wlIp}
                onChange={(e) => setWlIp(e.target.value)}
                placeholder="z. B. 203.0.113.10"
                autoComplete="off"
              />
            </label>
            <label className="admin-filter-field">
              <span className="admin-field-label">Bezeichnung</span>
              <input
                className="admin-input"
                value={wlLabel}
                onChange={(e) => setWlLabel(e.target.value)}
                placeholder="optional"
                autoComplete="off"
              />
            </label>
            <button type="button" className="admin-btn-primary" onClick={() => void addWhitelist()} disabled={!!busy}>
              Hinzufügen
            </button>
          </div>
        </div>
        <TableEmpty
          loading={loading}
          empty={!loading && !(data?.whitelist?.length > 0)}
          emptyLabel="Keine Whitelist-Einträge — Team-IPs hier eintragen."
        />
        {data?.whitelist?.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>IP / CIDR</th>
                  <th>Bezeichnung</th>
                  <th>Seit</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {data.whitelist.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.ipCidr}</code>
                    </td>
                    <td>{row.label || "—"}</td>
                    <td>{formatDt(row.createdAt)}</td>
                    <td className="admin-rides-table__actions">
                      <button
                        type="button"
                        className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                        onClick={() => void removeWhitelist(row.id, row.ipCidr)}
                        disabled={busy === row.id}
                      >
                        {busy === row.id ? "…" : "Entfernen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Permanente Blockliste"
        subtitle={`Jail ${data?.permanentJail ?? "onroda-permanent"} · zusätzlich zu zeitlichen Fail2Ban-Sperren`}
        defaultOpen={false}
        flushBody
      >
        <div className="admin-section-block__inset">
          <div className="admin-filter-toolbar admin-filter-toolbar--modern">
            <label className="admin-filter-field">
              <span className="admin-field-label">IP / CIDR</span>
              <input
                className="admin-input"
                value={blIp}
                onChange={(e) => setBlIp(e.target.value)}
                placeholder="IP oder CIDR"
                autoComplete="off"
              />
            </label>
            <label className="admin-filter-field">
              <span className="admin-field-label">Bezeichnung</span>
              <input
                className="admin-input"
                value={blLabel}
                onChange={(e) => setBlLabel(e.target.value)}
                placeholder="optional"
                autoComplete="off"
              />
            </label>
            <label className="admin-filter-field admin-filter-field--wide">
              <span className="admin-field-label">Grund</span>
              <input
                className="admin-input"
                value={blReason}
                onChange={(e) => setBlReason(e.target.value)}
                placeholder="z. B. wiederkehrender Scan"
                autoComplete="off"
              />
            </label>
            <button type="button" className="admin-btn-danger" onClick={() => void addBlocklist()} disabled={!!busy}>
              Permanent sperren
            </button>
          </div>
        </div>
        <TableEmpty
          loading={loading}
          empty={!loading && !(data?.blocklist?.length > 0)}
          emptyLabel="Keine permanenten Sperren."
        />
        {data?.blocklist?.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>IP / CIDR</th>
                  <th>Grund</th>
                  <th>Seit</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {data.blocklist.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.ipCidr}</code>
                    </td>
                    <td>{row.reason || row.label || "—"}</td>
                    <td>{formatDt(row.createdAt)}</td>
                    <td className="admin-rides-table__actions">
                      <button
                        type="button"
                        className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                        onClick={() => void removeBlocklist(row.id, row.ipCidr)}
                        disabled={busy === row.id}
                      >
                        {busy === row.id ? "…" : "Aufheben"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Sperren pro Tag"
        subtitle="Ban-/Unban-Ereignisse aus diesem Dashboard"
        defaultOpen={false}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              className={statsDays === d ? "admin-btn-primary" : "admin-c-btn-sec"}
              onClick={() => setStatsDays(d)}
            >
              {d} Tage
            </button>
          ))}
        </div>
        <SimpleBanChart daily={statsDaily} valueKey="bans" />
        <p className="admin-muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Basis: Dashboard-Aktionen — nicht das vollständige Fail2Ban-Log.
        </p>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Manuell sperren"
        subtitle="Zeitliche Sperre in einem Fail2Ban-Jail"
        defaultOpen={false}
      >
        <div className="admin-filter-toolbar admin-filter-toolbar--modern">
          <label className="admin-filter-field">
            <span className="admin-field-label">IP-Adresse</span>
            <input
              className="admin-input"
              value={banIp}
              onChange={(e) => setBanIp(e.target.value)}
              placeholder="z. B. 1.2.3.4"
              autoComplete="off"
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Jail</span>
            <select className="admin-input" value={banJail} onChange={(e) => setBanJail(e.target.value)}>
              {jails.map((j) => (
                <option key={j.jail} value={j.jail}>
                  {j.jail}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-btn-danger" onClick={() => void ban()} disabled={!!busy}>
            Sperren
          </button>
        </div>
      </AdminCollapsibleSection>

      {loading ? (
        <AdminCollapsibleSection title="Gesperrte IPs" subtitle="Wird geladen …" defaultOpen collapsible={false}>
          <p className="admin-muted">Lädt …</p>
        </AdminCollapsibleSection>
      ) : (
        jails.map((j) => (
          <AdminCollapsibleSection
            key={j.jail}
            title={j.jail}
            subtitle={`Aktuell gesperrt: ${j.currentBanned} · Gesamt: ${j.totalBanned}`}
            defaultOpen={j.currentBanned > 0}
            flushBody
          >
            <TableEmpty
              loading={false}
              empty={!j.bannedIps?.length}
              emptyLabel="Keine gesperrten IPs in diesem Jail."
            />
            {j.bannedIps?.length > 0 ? (
              <div className="admin-rides-table-wrap">
                <table className="admin-rides-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>
                        <input
                          type="checkbox"
                          checked={allRows.length > 0 && selected.size >= allRows.length}
                          onChange={toggleSelectAll}
                          aria-label="Alle auswählen"
                        />
                      </th>
                      <th>IP</th>
                      <th>Land / Hoster</th>
                      <th>Flags</th>
                      <th className="admin-rides-table__col-actions">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.bannedIps.map((row) => {
                      const key = selectionKey(row.ip, j.jail);
                      return (
                        <tr key={key}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleSelect(row.ip, j.jail)}
                              aria-label={`${row.ip} auswählen`}
                            />
                          </td>
                          <td>
                            <code>{row.ip}</code>
                          </td>
                          <td>
                            <GeoCell geo={row.geo} />
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {row.whitelisted ? (
                                <span className="admin-c-badge admin-c-badge--ok">Whitelist</span>
                              ) : null}
                              {row.permanent ? (
                                <span className="admin-c-badge admin-c-badge--err">Permanent</span>
                              ) : null}
                              {!row.whitelisted && !row.permanent ? (
                                <span className="admin-muted">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="admin-rides-table__actions">
                            <button
                              type="button"
                              className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                              onClick={() => void unban(row.ip, j.jail)}
                              disabled={busy === `${row.ip}-${j.jail}`}
                            >
                              {busy === `${row.ip}-${j.jail}` ? "…" : "Entsperren"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </AdminCollapsibleSection>
        ))
      )}

      {!loading && data?.jailConfigs?.length ? (
        <AdminCollapsibleSection
          title="Jail-Konfiguration"
          subtitle="bantime / findtime / maxretry / bantime.increment"
          defaultOpen={false}
          flushBody
        >
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Jail</th>
                  <th>bantime</th>
                  <th>findtime</th>
                  <th>maxretry</th>
                  <th>bantime.increment</th>
                </tr>
              </thead>
              <tbody>
                {data.jailConfigs.map((c) => (
                  <tr key={c.jail}>
                    <td>{c.jail}</td>
                    <td>
                      <code>{c.bantime ?? "—"}</code>
                    </td>
                    <td>
                      <code>{c.findtime ?? "—"}</code>
                    </td>
                    <td>
                      <code>{c.maxretry ?? "—"}</code>
                    </td>
                    <td>
                      <code>{c.bantimeIncrement ?? "—"}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCollapsibleSection>
      ) : null}

      <style>{`
        .hp-analytics-chart { margin-top: 4px; }
        .hp-analytics-chart__bars {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          min-height: 160px;
          padding: 8px 4px 0;
          border-bottom: 1px solid var(--onroda-border, #e2e8f0);
        }
        .hp-analytics-chart__col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          height: 160px;
        }
        .hp-analytics-chart__bar {
          width: 100%;
          max-width: 28px;
          background: linear-gradient(180deg, #f87171 0%, #dc2626 100%);
          border-radius: 6px 6px 2px 2px;
        }
        .hp-analytics-chart__label {
          margin-top: 6px;
          font-size: var(--admin-type-caption, 13px);
          color: var(--onroda-text-muted, #64748b);
        }
      `}</style>
    </div>
  );
}
