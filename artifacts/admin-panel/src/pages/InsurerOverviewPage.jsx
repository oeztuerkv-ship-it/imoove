import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { insurerSummaryUrl } from "../lib/insurerApi.js";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to) };
}

export default function InsurerOverviewPage() {
  const [range, setRange] = useState(defaultRange);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const url = insurerSummaryUrl({
        from: range.from,
        to: range.to,
        companyId: companyId.trim() || undefined,
      });
      const res = await fetch(url, { headers: adminApiHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error === "from_to_required" ? "Zeitraum (von/bis) ist erforderlich." : "Kennzahlen konnten nicht geladen werden.");
        setData(null);
        return;
      }
      setData(j.summary);
    } catch {
      setErr("Netzwerkfehler.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data;

  const kpiCards = s
    ? [
        ["Fahrten (gezählt)", s.rideCount],
        ["Abgeschlossen", s.completedCount],
        ["Stornos (Zähler)", s.cancelledCount],
        ["Summe Brutto (€)", s.totalGrossAmount?.toFixed?.(2) ?? s.totalGrossAmount],
        ["Ø Brutto / Fahrt (€)", s.avgGrossPerRide?.toFixed?.(2) ?? s.avgGrossPerRide],
        ["Offene Settlement-Zeilen (Fin.)", s.openSettlementCount],
      ]
    : [];

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Datensparsame Kennzahlen für Fahrten mit <strong>Zahler/Kontext Krankenkasse</strong> (
        <code>payer_kind = insurance</code>). Onroda ist Vermittler; Beförderer ist das jeweilige Taxi-Unternehmen.
      </p>

      {err ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{err}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Zeitraum & Filter" defaultOpen>
        <div className="admin-filter-toolbar">
          <label className="admin-filter-field">
            <span className="admin-field-label">Von</span>
            <input className="admin-input" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Bis</span>
            <input className="admin-input" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </label>
          <label className="admin-filter-field admin-filter-field--wide">
            <span className="admin-field-label">Mandant (optional)</span>
            <input
              className="admin-input"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="co-…"
            />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Kennzahlen" subtitle={loading ? "Wird geladen …" : "Krankenfahrt im Zeitraum"} defaultOpen>
        {loading && !s ? <p className="admin-table-sub">Lade …</p> : null}
        {s ? (
          <div className="admin-stat-grid">
            {kpiCards.map(([label, val]) => (
              <div key={label} className="admin-stat-card">
                <div className="admin-stat-label">{label}</div>
                <div className="admin-stat-value admin-crisp-numeric">{val}</div>
              </div>
            ))}
          </div>
        ) : !loading ? (
          <p className="admin-table-sub">Keine Daten für den Zeitraum.</p>
        ) : null}
      </AdminCollapsibleSection>
    </div>
  );
}
