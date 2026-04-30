import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

const ROWS = [
  ["normalRide", "Normale Fahrt"],
  ["preBooking", "Vorbestellung (Sofort vs. Termin-Policy)"],
  ["medicalRide", "Krankenfahrt"],
  ["voucher", "Gutschein (Produktlinie)"],
  ["accessCode", "Gutschein-/Zugangscode (Einlösung)"],
  ["companyTrip", "Firmenfahrt / B2B"],
  ["hotelBooking", "Hotelbuchung (Kontext)"],
  ["cash", "Barzahlung"],
  ["invoice", "Rechnung / Rechnungsweg"],
  ["onlinePayLater", "Später online zahlen (vorbereitet)"],
  ["driverTracking", "Fahrer-Tracking (Kundensicht)"],
];

export default function AppOperationalFeaturesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [f, setF] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      if (data.config?.features && typeof data.config.features === "object") {
        setF({ ...data.config.features });
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
    const features = { ...f };
    for (const [k] of ROWS) {
      if (features[k] === undefined) features[k] = true;
    }
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ features }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("Funktions-Speicher gespeichert. Kunden-POST /rides wertet serverseitig mit aus.");
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
        <div className="admin-panel-card__title">Funktionen (Feature-Toggles)</div>
        <p className="admin-table-sub">
          Auch in <code>{API_BASE}/app/config</code> und auf der API bei <code>POST /rides</code> geprüft (Zahlen/Arten).
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 12 }}>
          {ROWS.map(([k, label]) => {
            const c = k === "onlinePayLater" ? f[k] === true : f[k] !== false;
            return (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={c}
                onChange={(e) => setF((p) => ({ ...p, [k]: e.target.checked }))}
              />
              <span>{label}</span>
            </label>
            );
          })}
        </div>
        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
      </div>
    </div>
  );
}
