import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

export default function AppOperationalSystemPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [s, setS] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      if (data.config?.system && typeof data.config.system === "object") {
        setS({ ...data.config.system });
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
    const system = { ...s };
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ system }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("System-Flags gespeichert. POST /rides und Health prüfen blockNewBookings, emergencyShutdown, Apps.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (loading) return <div className="admin-page"><p className="admin-table-sub">Laden …</p></div>;

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">System / Wartung</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          <code>emergencyShutdown</code> = harte Sperrung (wirkt wie 503/400 auf Buchungs-API, siehe Rides-Route).{" "}
          <code>minAppVersionHint</code> = reiner Anzeigewert in der Kunden-App, Hard-Enforcement optional später.
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 12 }}>
          {[
            ["maintenanceMode", "Wartungsmodus (Hinweis, kombiniere mit Kunden-App-Flag unten)"],
            ["blockNewBookings", "Neue Buchungen sperren (Kunden) — 400 mit bookingRules-Meldung"],
            ["allowCustomerApp", "Kunden-App erlaubt (false + Wartung = Sperrung) — siehe Rides-Route"],
            ["allowDriverApp", "Fahrer-App erlaubt (Hinweis, Mobile)"],
            ["emergencyShutdown", "Notfall-Abschaltung (höchste Priorität, harte 503) — vorsichtig!"],
          ].map(([k, label]) => {
            const negDefault = k === "allowCustomerApp" || k === "allowDriverApp";
            const checked = negDefault ? s[k] !== false : s[k] === true;
            return (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setS((p) => ({ ...p, [k]: e.target.checked }))}
              />
              <span style={{ lineHeight: 1.4 }}>{label}</span>
            </label>
            );
          })}
          <label className="admin-form-label" style={{ display: "block", marginTop: 12 }}>
            Globaler Hinweis (Kunden, Deutsch)
            <textarea
              className="admin-textarea"
              rows={3}
              value={String(s.globalNoticeDe ?? "")}
              onChange={(e) => setS((p) => ({ ...p, globalNoticeDe: e.target.value }))}
            />
          </label>
          <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
            Mindest-App-Version (Hinweis, z. B. 1.0.0 — leer = kein)
            <input
              className="admin-input"
              style={{ maxWidth: 200, marginTop: 4, display: "block" }}
              value={s.minAppVersionHint == null ? "" : String(s.minAppVersionHint)}
              onChange={(e) => {
                const v = e.target.value.trim();
                setS((p) => ({ ...p, minAppVersionHint: v === "" ? null : v }));
              }}
            />
          </label>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
        <p className="admin-table-sub" style={{ marginTop: 8 }}>
          <code>GET {API_BASE}/app/config</code> → <code>system</code> — Apps lesen, API erzwingt.
        </p>
      </div>
    </div>
  );
}
