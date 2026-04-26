import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

export default function AppOperationalCommissionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [defaultRatePercent, setDefaultRatePercent] = useState("7");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      const rate = data.config?.commission?.defaultRate;
      setDefaultRatePercent(
        typeof rate === "number" && Number.isFinite(rate) ? String(Math.round(rate * 1000) / 10) : "7",
      );
      setActive(data.config?.commission?.active !== false);
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
    setSaving(true);
    setError("");
    setOkMsg("");
    const n = Number(String(defaultRatePercent).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError("Bitte eine gültige Prozentzahl 0–100.");
      setSaving(false);
      return;
    }
    const defaultRate = n / 100;
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ commission: { defaultRate, active } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setOkMsg("Provision gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <p className="admin-table-sub">Laden …</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {okMsg ? <div className="admin-info-banner admin-info-banner--ok">{okMsg}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Standard-Provision (MVP)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5, marginBottom: 12 }}>
          Globale Soll-Provision; später erweiterbar pro Stadt, Partner und Fahrtart. Im MVP nur Platzhalter für
          Prozesse/Reports — Kunden-App liest die Konfiguration mit.
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 360 }}>
          <label className="admin-form-label" htmlFor="comPct">
            Standard-Provision (%)
          </label>
          <input
            id="comPct"
            className="admin-input"
            value={defaultRatePercent}
            onChange={(e) => setDefaultRatePercent(e.target.value)}
            inputMode="decimal"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Provision-Modul aktiv (Schalter für spätere Auswertung)</span>
          </label>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ marginTop: 16, alignSelf: "flex-start" }}
            onClick={save}
            disabled={saving}
          >
            {saving ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
