import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

export default function AppOperationalRegionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [regions, setRegions] = useState([]);
  const [outOfServiceDe, setOutOfServiceDe] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Laden fehlgeschlagen (${res.status})`);
      }
      setConfig(data.config ?? null);
      setRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      const m = data.config?.messages?.outOfServiceAreaDe;
      setOutOfServiceDe(typeof m === "string" ? m : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMessage = async () => {
    setSavingMsg(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ messages: { outOfServiceAreaDe: outOfServiceDe.trim() } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setOkMsg("Hinweistext gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSavingMsg(false);
    }
  };

  const saveRegion = async (r) => {
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`${URL}/service-regions/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          label: r.label,
          matchTerms: r.matchTerms,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Region speichern fehlgeschlagen");
      setRegions((prev) => prev.map((x) => (x.id === r.id ? data.serviceRegion : x)));
      setOkMsg(`Gebiet „${r.label}“ gespeichert.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Hinweis bei gesperrter Buchung (Kunden-App)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          Wird nur angezeigt, wenn Start- und Zieladresse keinem aktiven Gebiet entsprechen. Kein Hinweis, wenn beide
          in einem freigegebenen Gebiet liegen.
        </p>
        <div className="admin-form-vertical" style={{ marginTop: 12, maxWidth: 640 }}>
          <label className="admin-form-label" htmlFor="outsvc">
            Text (Deutsch)
          </label>
          <textarea
            id="outsvc"
            className="admin-textarea"
            rows={3}
            value={outOfServiceDe}
            onChange={(e) => setOutOfServiceDe(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={saveMessage}
            disabled={savingMsg}
          >
            {savingMsg ? "Speichert …" : "Hinweis speichern"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="admin-info-banner admin-info-banner--error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="admin-info-banner admin-info-banner--ok" style={{ marginBottom: 12 }}>
          {okMsg}
        </div>
      ) : null}

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Aktive Städte / Gebiete</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          Eine Fahrt ist zulässig, wenn Start- und Ziel jeweils mindestens ein aktives Gebiet treffen
          (Suchbegriff kommt in der vollständigen Adresse vor, Groß/Klein egal). Ohne konfigurierte aktive Gebiete
          blockiert die Plattform nicht (Fail-open).
        </p>
        {loading ? (
          <p className="admin-table-sub">Laden …</p>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: 12 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Suchbegriffe (Treffer in Adresse)</th>
                  <th>Aktiv</th>
                  <th>Sort.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <AppRegionRow
                    key={r.id}
                    initial={r}
                    onSave={(row) => void saveRegion(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AppRegionRow({ initial, onSave }) {
  const [label, setLabel] = useState(initial.label);
  const [termsStr, setTermsStr] = useState((initial.matchTerms || []).join(", "));
  const [isActive, setIsActive] = useState(initial.isActive);
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder));

  return (
    <tr>
      <td>
        <input className="admin-input" value={label} onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 120 }} />
      </td>
      <td>
        <input
          className="admin-input"
          value={termsStr}
          onChange={(e) => setTermsStr(e.target.value)}
          placeholder="stuttgart, stuttgart-mitte, …"
          style={{ minWidth: 220 }}
        />
      </td>
      <td>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </td>
      <td>
        <input
          className="admin-input"
          style={{ width: 56 }}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </td>
      <td>
        <button
          type="button"
          className="admin-btn admin-btn--small"
          onClick={() => {
            const matchTerms = termsStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onSave({
              ...initial,
              label: label.trim(),
              matchTerms,
              isActive,
              sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : initial.sortOrder,
            });
          }}
        >
          Speichern
        </button>
      </td>
    </tr>
  );
}
