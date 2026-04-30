import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

const ROWS = [
  ["pScheinRequired", "P-Schein Pflicht"],
  ["vehicleRequired", "Fahrzeug Pflicht"],
  ["documentsRequired", "Dokumente vollständig (Pflicht)"],
  ["systemOverrideAllowed", "System-Override für Freigabe erlauben (Notfall) — Admin setzt Policy, nicht Dauerzustand"],
  ["requirePlatformApprovalToGoOnline", "Nur online mit Plattform-Freigabe"],
  ["vehicleAssignmentRequired", "Fahrzeugzuweisung verpflichtend"],
  ["documentExpiryCheck", "Ablaufdatum-Prüfung (Dokumente)"],
];

export default function AppOperationalDriverRulesPage() {
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
      if (data.config?.driverRules && typeof data.config.driverRules === "object") {
        setD({ ...data.config.driverRules });
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
    const driverRules = { ...d };
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ driverRules }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("Fahrer-Regeln gespeichert. Fleet-/Bereitstellungs-APIs werten in Kombination mit Fleet-Readiness.");
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
        <div className="admin-panel-card__title">Fahrer-Regeln (Plattform)</div>
        <p className="admin-table-sub">
          Sicht: Plattform-Operator, nicht Unternehmersicht. Tiefere Durchsetzung in Fleet-/Bereitstellung im API-Bundle.
        </p>
        <div style={{ maxWidth: 600 }}>
          {ROWS.map(([k, label]) => {
            const checked = k === "systemOverrideAllowed" ? d[k] === true : d[k] !== false;
            return (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setD((p) => ({ ...p, [k]: e.target.checked }))}
              />
              <span style={{ lineHeight: 1.4 }}>{label}</span>
            </label>
            );
          })}
        </div>
        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
        <p className="admin-table-sub" style={{ marginTop: 8 }}>
          Öffentlich: <code>GET {API_BASE}/app/config</code> → <code>driverRules</code>
        </p>
      </div>
    </div>
  );
}
