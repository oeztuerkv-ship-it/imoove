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
    return <p className="admin-m-muted">Noch keine Ereignisse im gewählten Zeitraum.</p>;
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
  if (!geo?.lookupOk) return <span className="admin-m-muted">—</span>;
  const country = geo.countryCode ? `${geo.country ?? "?"} (${geo.countryCode})` : geo.country ?? "—";
  return (
    <span title={geo.isp ?? ""}>
      {country}
      {geo.hosterLabel ? (
        <>
          <br />
          <span className="admin-m-muted" style={{ fontSize: 12 }}>
            {geo.hosterLabel}
          </span>
        </>
      ) : null}
    </span>
  );
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
          geo: row.geo,
          permanent: row.permanent,
          whitelisted: row.whitelisted,
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
    <div className="admin-page admin-page--security">
      {msg ? (
        <div className="admin-info-banner admin-info-banner--inline admin-info-banner--success" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      ) : null}
      {error ? (
        <div className="admin-info-banner admin-info-banner--inline admin-info-banner--error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" className="admin-c-btn admin-c-btn--secondary" onClick={() => void fetchStatus()} disabled={loading}>
          ↻ Aktualisieren
        </button>
        <button type="button" className="admin-c-btn admin-c-btn--secondary" onClick={() => void syncRules()} disabled={!!busy}>
          Regeln synchronisieren
        </button>
        {selected.size > 0 ? (
          <button type="button" className="admin-c-btn admin-c-btn--primary" onClick={() => void bulkUnban()} disabled={!!busy}>
            {selected.size} ausgewählt — entsperren
          </button>
        ) : null}
      </div>

      {!loading && data ? (
        <>
          <section className="admin-m-card admin-m-card--unified" style={{ marginBottom: 16 }}>
            <h3 className="admin-m-card__title">Systemstatus</h3>
            <div className="admin-kv-grid admin-kv-grid--2">
              <div>
                <span className="admin-kv-grid__k">Fail2Ban</span>
                <span className="admin-kv-grid__v">{data.fail2banAvailable ? "Erreichbar" : "Nicht verfügbar"}</span>
              </div>
              <div>
                <span className="admin-kv-grid__k">Permanenter Jail</span>
                <span className="admin-kv-grid__v">{data.permanentJail ?? "onroda-permanent"}</span>
              </div>
              <div>
                <span className="admin-kv-grid__k">Panel-Login-Schutz</span>
                <span className="admin-kv-grid__v">
                  <span className={`admin-c-badge ${panelProtectionClass(panel?.status)}`}>
                    {panel?.jail ?? "nginx-http-auth"}
                  </span>
                  {" · "}
                  {panel?.currentBanned ?? 0} aktiv / {panel?.totalBanned ?? 0} gesamt
                </span>
              </div>
              <div>
                <span className="admin-kv-grid__k">Gestaffelte Sperrzeit</span>
                <span className="admin-kv-grid__v">
                  {incrementJails.length
                    ? `${incrementJails.length} Jail(s) mit bantime.increment`
                    : "Nicht aktiv — siehe Deploy-Beispiel"}
                </span>
              </div>
            </div>
            {panel?.hint ? <p className="admin-m-muted" style={{ marginTop: 12, marginBottom: 0 }}>{panel.hint}</p> : null}
          </section>

          <AdminCollapsibleSection title="Whitelist — Team-IPs (Schutz vor Selbstsperre)" defaultOpen>
            <p className="admin-m-muted">
              Einträge werden in Fail2Ban als <code>ignoreip</code> auf alle Jails angewendet. Gesperrte Whitelist-IPs können nicht erneut gebannt werden.
            </p>
            <div className="admin-form-row" style={{ marginTop: 12, marginBottom: 12 }}>
              <input
                className="admin-c-input"
                value={wlIp}
                onChange={(e) => setWlIp(e.target.value)}
                placeholder="IP oder CIDR, z. B. 203.0.113.10"
              />
              <input
                className="admin-c-input"
                value={wlLabel}
                onChange={(e) => setWlLabel(e.target.value)}
                placeholder="Bezeichnung (optional)"
              />
              <button type="button" className="admin-c-btn admin-c-btn--primary" onClick={() => void addWhitelist()} disabled={!!busy}>
                Hinzufügen
              </button>
            </div>
            {!data.whitelist?.length ? (
              <p className="admin-m-muted">Keine Whitelist-Einträge — Team-IPs hier eintragen.</p>
            ) : (
              <table className="admin-c-table admin-c-table--compact">
                <thead>
                  <tr>
                    <th>IP / CIDR</th>
                    <th>Bezeichnung</th>
                    <th>Seit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.whitelist.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-c-table__mono">{row.ipCidr}</td>
                      <td>{row.label || "—"}</td>
                      <td>{formatDt(row.createdAt)}</td>
                      <td className="admin-c-table__actions">
                        <button
                          type="button"
                          className="admin-c-btn admin-c-btn--ghost admin-c-btn--sm"
                          onClick={() => void removeWhitelist(row.id, row.ipCidr)}
                          disabled={busy === row.id}
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminCollapsibleSection>

          <AdminCollapsibleSection title="Permanente Blockliste" defaultOpen={false}>
            <p className="admin-m-muted">
              Zusätzlich zu zeitlichen Fail2Ban-Sperren. Einträge werden im Jail <code>{data.permanentJail}</code> angewendet (Fallback: erster Jail).
            </p>
            <div className="admin-form-row" style={{ marginTop: 12, marginBottom: 12 }}>
              <input className="admin-c-input" value={blIp} onChange={(e) => setBlIp(e.target.value)} placeholder="IP oder CIDR" />
              <input className="admin-c-input" value={blLabel} onChange={(e) => setBlLabel(e.target.value)} placeholder="Bezeichnung" />
              <input className="admin-c-input" value={blReason} onChange={(e) => setBlReason(e.target.value)} placeholder="Grund" />
              <button type="button" className="admin-c-btn admin-c-btn--danger" onClick={() => void addBlocklist()} disabled={!!busy}>
                Permanent sperren
              </button>
            </div>
            {!data.blocklist?.length ? (
              <p className="admin-m-muted">Keine permanenten Sperren.</p>
            ) : (
              <table className="admin-c-table admin-c-table--compact">
                <thead>
                  <tr>
                    <th>IP / CIDR</th>
                    <th>Grund</th>
                    <th>Seit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.blocklist.map((row) => (
                    <tr key={row.id}>
                      <td className="admin-c-table__mono">{row.ipCidr}</td>
                      <td>{row.reason || row.label || "—"}</td>
                      <td>{formatDt(row.createdAt)}</td>
                      <td className="admin-c-table__actions">
                        <button
                          type="button"
                          className="admin-c-btn admin-c-btn--ghost admin-c-btn--sm"
                          onClick={() => void removeBlocklist(row.id, row.ipCidr)}
                          disabled={busy === row.id}
                        >
                          Aufheben
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminCollapsibleSection>

          <AdminCollapsibleSection title="Sperren pro Tag" defaultOpen={false}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`admin-c-btn admin-c-btn--sm ${statsDays === d ? "admin-c-btn--primary" : "admin-c-btn--secondary"}`}
                  onClick={() => setStatsDays(d)}
                >
                  {d} Tage
                </button>
              ))}
            </div>
            <SimpleBanChart daily={statsDaily} valueKey="bans" />
            <p className="admin-m-muted" style={{ marginTop: 8 }}>
              Basis: Ban-/Unban-Ereignisse aus diesem Dashboard (nicht vollständiges Fail2Ban-Log).
            </p>
          </AdminCollapsibleSection>

          <AdminCollapsibleSection title="Manuell sperren (zeitlich, Fail2Ban-Jail)" defaultOpen={false}>
            <div className="admin-form-row">
              <input
                className="admin-c-input"
                value={banIp}
                onChange={(e) => setBanIp(e.target.value)}
                placeholder="IP-Adresse"
              />
              <select className="admin-c-input" value={banJail} onChange={(e) => setBanJail(e.target.value)}>
                {jails.map((j) => (
                  <option key={j.jail} value={j.jail}>
                    {j.jail}
                  </option>
                ))}
              </select>
              <button type="button" className="admin-c-btn admin-c-btn--danger" onClick={() => void ban()} disabled={!!busy}>
                Sperren
              </button>
            </div>
          </AdminCollapsibleSection>
        </>
      ) : null}

      {loading ? (
        <p className="admin-m-muted">Lädt…</p>
      ) : (
        jails.map((j) => (
          <section key={j.jail} className="admin-m-card admin-m-card--unified" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 className="admin-m-card__title" style={{ margin: 0 }}>
                {j.jail}
              </h3>
              <span className="admin-m-muted">
                Aktuell: <strong>{j.currentBanned}</strong> · Gesamt: {j.totalBanned}
              </span>
            </div>
            {!j.bannedIps?.length ? (
              <p className="admin-m-muted">Keine gesperrten IPs</p>
            ) : (
              <table className="admin-c-table admin-c-table--compact">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
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
                    <th />
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
                        <td className="admin-c-table__mono">{row.ip}</td>
                        <td>
                          <GeoCell geo={row.geo} />
                        </td>
                        <td>
                          {row.whitelisted ? <span className="admin-c-badge admin-c-badge--ok">Whitelist</span> : null}
                          {row.permanent ? <span className="admin-c-badge admin-c-badge--err">Permanent</span> : null}
                        </td>
                        <td className="admin-c-table__actions">
                          <button
                            type="button"
                            className="admin-c-btn admin-c-btn--ghost admin-c-btn--sm"
                            onClick={() => void unban(row.ip, j.jail)}
                            disabled={busy === `${row.ip}-${j.jail}`}
                          >
                            Entsperren
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        ))
      )}

      {!loading && data?.jailConfigs?.length ? (
        <AdminCollapsibleSection title="Jail-Konfiguration (Fail2Ban)" defaultOpen={false}>
          <table className="admin-c-table admin-c-table--compact">
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
                  <td className="admin-c-table__mono">{c.bantime ?? "—"}</td>
                  <td className="admin-c-table__mono">{c.findtime ?? "—"}</td>
                  <td className="admin-c-table__mono">{c.maxretry ?? "—"}</td>
                  <td className="admin-c-table__mono">{c.bantimeIncrement ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCollapsibleSection>
      ) : null}

      <style>{`
        .hp-analytics-chart { margin-top: 12px; }
        .hp-analytics-chart__bars {
          display: flex; align-items: flex-end; gap: 4px; height: 120px;
          border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;
        }
        .hp-analytics-chart__col {
          flex: 1; min-width: 12px; height: 100%; display: flex; flex-direction: column;
          align-items: center; justify-content: flex-end;
        }
        .hp-analytics-chart__bar {
          width: 100%; max-width: 28px; background: linear-gradient(180deg, #f87171, #dc2626);
          border-radius: 3px 3px 0 0; min-height: 4px;
        }
        .hp-analytics-chart__label { font-size: 10px; color: #64748b; margin-top: 4px; }
        .admin-form-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .admin-form-row .admin-c-input { flex: 1; min-width: 140px; }
      `}</style>
    </div>
  );
}
