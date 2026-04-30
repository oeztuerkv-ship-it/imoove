import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

export default function AppOperationalDispatchPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [d, setD] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      if (data.config?.dispatch && typeof data.config.dispatch === "object") {
        setD({ ...data.config.dispatch });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError("");
    setOk("");
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ dispatch: d }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("Dispatch-Konfiguration gespeichert. Dispatch-Engine wertet bei nächstem Lauf / nächster Policy aus.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (loading) return <div className="admin-page"><p className="admin-table-sub">Laden …</p></div>;

  const b = (key, label) => (
    <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
      {label}
      <input
        type="checkbox"
        className="admin-input"
        style={{ width: 24, marginTop: 4, display: "block" }}
        checked={d[key] !== false}
        onChange={(e) => setD((p) => ({ ...p, [key]: e.target.checked }))}
      />
    </label>
  );

  const n = (key, label) => (
    <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
      {label}
      <input
        className="admin-input"
        type="text"
        inputMode="numeric"
        style={{ maxWidth: 200, display: "block", marginTop: 4 }}
        value={d[key] == null ? "" : String(d[key])}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || v === "-") {
            setD((p) => ({ ...p, [key]: v }));
            return;
          }
          setD((p) => ({ ...p, [key]: Number.isFinite(Number(v)) ? Number(v) : p[key] }));
        }}
      />
    </label>
  );

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Dispatch (Kunden-App / Plattform)</div>
        <p className="admin-table-sub">Landet in <code>GET {API_BASE}/app/config</code> → <code>dispatch</code>. Der Dispatch-Service darf die Werte unabhängig von der App auswerten (Server-Quelle).</p>
        <div style={{ maxWidth: 420 }}>
          {b("active", "Dispatch-Modul aktiv (semantik je nach Hintergrund-Dispatcher)")}
          {b("ownDriversFirst", "Eigene Fahrer zuerst (Mandantenkontext)")}
          {b("openMarket", "Open Market (Marktplatz) zulassen")}
          {b("autoReassignOnReject", "Automatische Weitergabe bei Fahrer-Ablehnung")}
          {b("autoReassignOnTimeout", "Automatische Weitergabe bei Timeout (Angebot)")}
          {b("blockAfterMultipleRejects", "Nach mehreren Ablehnungen sperren (Policy)")}
          {n("exclusiveSeconds", "Exklusivzeit (Sekunden) — Angebot nur an einen Fahrer n sec")}
          {n("radiusKm", "Suchradius (km) für anfragbare Fahrer — Planungsgröße")}
          <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>Priorität (distance | fairness | —)</label>
          <input
            className="admin-input"
            style={{ maxWidth: 200, marginTop: 4 }}
            value={String(d.priority ?? "distance")}
            onChange={(e) => setD((p) => ({ ...p, priority: e.target.value }))}
          />
        </div>
        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
      </div>
    </div>
  );
}
