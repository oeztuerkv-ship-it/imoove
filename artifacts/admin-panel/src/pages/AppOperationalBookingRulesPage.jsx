import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

export default function AppOperationalBookingRulesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [b, setB] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      if (data.config?.bookingRules && typeof data.config.bookingRules === "object") {
        setB({ ...data.config.bookingRules });
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
    const keys = [
      "minPrebookLeadMinutes",
      "maxRouteKm",
      "maxWaitMinutes",
      "cancellationWindowMinutes",
      "cancellationFeeAfterWindowEur",
    ];
    const bookingRules = { ...b };
    for (const k of keys) {
      const v = bookingRules[k];
      if (v === "" || v === null || v === undefined) {
        if (k === "cancellationFeeAfterWindowEur") continue;
        delete bookingRules[k];
        continue;
      }
      const n = Number(v);
      if (Number.isFinite(n)) bookingRules[k] = n;
    }
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ bookingRules }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("Buchungsregeln gespeichert. POST /rides prüft serverseitig mit; Stornofenster bei Cancel folgt in eigener API-Strecke.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (loading) return <div className="admin-page"><p className="admin-table-sub">Laden …</p></div>;

  const num = (k, label) => (
    <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
      {label}
      <input
        className="admin-input"
        inputMode="numeric"
        style={{ maxWidth: 200, display: "block", marginTop: 4 }}
        value={b[k] == null ? "" : String(b[k])}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || v === "-") {
            setB((p) => ({ ...p, [k]: v === "" ? "" : p[k] }));
            return;
          }
          const n = Number(v);
          setB((p) => ({ ...p, [k]: Number.isFinite(n) ? n : p[k] }));
        }}
      />
    </label>
  );

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Buchungsregeln</div>
        <p className="admin-table-sub" style={{ maxWidth: 720, lineHeight: 1.5 }}>
          <strong>Telefon</strong> optional, bis Kunden-App <code>customerPhone</code> mitsendet. <strong>Diagnosen</strong> in
          Krankenfahrt nicht speichern — Policy-Flag; Implementierung: keine Speicherung sensibler Freitexte.
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 420, marginTop: 12 }}>
          {num("minPrebookLeadMinutes", "Mindest-Vorlauf (Min.) für Termin / Vorbestellung")}
          {num("maxRouteKm", "Maximale Route (km) in der Kunden-App (Schätzung, API prüft distanceKm).")}
          {num("maxWaitMinutes", "Max. Wartezeit-Annahme (Hinweis, optional)")}
          {num("cancellationWindowMinutes", "Storno: kostenloses / günstigstes Fenster in Min. vor Abholung (Hinweis) — Cancel-Logik in Bearbeitung")}
          {num("cancellationFeeAfterWindowEur", "Stornogebühr (EUR) — nach Fenster (Hinweis, Tarif-Parallel)")}
        </div>
        <h4 className="admin-table-sub" style={{ marginTop: 20, fontSize: 14, fontWeight: 700 }}>
          Pflichtfelder (API / App)
        </h4>
        {[
          ["requireName", "Name"],
          ["requirePhone", "Telefon (Feld muss mitsender Client senden, sobald produktiv)"],
          ["requireFromAddress", "Startadresse"],
          ["requireToAddress", "Zieladresse"],
        ].map(([k, label]) => {
          const checked = k === "requirePhone" ? b[k] === true : b[k] !== false;
          return (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setB((p) => ({ ...p, [k]: e.target.checked }))}
            />
            <span>{label}</span>
          </label>
          );
        })}
        <h4 className="admin-table-sub" style={{ marginTop: 20, fontSize: 14, fontWeight: 700 }}>
          Krankenfahrt
        </h4>
        {[
          ["medicalCostCenterRequired", "Kostenstelle / Leistungsreferenz Pflicht (billingReference)"],
          ["medicalTransportDocumentRequired", "Transport- / Verordnungsnachweis (Prozess; Felder in Partner/Meta-API)"],
          ["doNotStoreDiagnosis", "Keine Diagnose in Klartext speichern (Datenschutz)"],
        ].map(([k, label]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={k === "doNotStoreDiagnosis" ? b[k] !== false : b[k] === true}
              onChange={(e) => setB((p) => ({ ...p, [k]: e.target.checked }))}
            />
            <span style={{ lineHeight: 1.4 }}>{label}</span>
          </label>
        ))}
        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
        <p className="admin-table-sub" style={{ marginTop: 8 }}>
          Öffentlich: <code>GET {API_BASE}/app/config</code> → <code>bookingRules</code>
        </p>
      </div>
    </div>
  );
}
