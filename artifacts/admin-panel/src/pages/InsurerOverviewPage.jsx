import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 960 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Krankenkassen · Übersicht</h1>
      <p style={{ margin: "0 0 16px", color: "var(--onroda-text-muted, #64748b)", lineHeight: 1.5, maxWidth: 720 }}>
        Datensparsame Kennzahlen für Fahrten mit <strong>Zahler/Kontext Krankenkasse</strong> (<code>payer_kind = insurance</code>).
        Onroda ist Vermittler; Beförderer ist das jeweilige Taxi-Unternehmen.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Von
          <input className="admin-input" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Bis
          <input className="admin-input" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Mandant (optional)
          <input
            className="admin-input"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="co-…"
            style={{ minWidth: 200 }}
          />
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void load()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
      </div>
      {err ? <div className="admin-error-banner">{err}</div> : null}
      {loading && !s ? (
        <p className="admin-table-sub">Lade …</p>
      ) : s ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {[
            ["Fahrten (gezählt)", s.rideCount],
            ["Abgeschlossen", s.completedCount],
            ["Stornos (Zähler)", s.cancelledCount],
            ["Summe Brutto (€)", s.totalGrossAmount?.toFixed?.(2) ?? s.totalGrossAmount],
            ["Ø Brutto / Fahrt (€)", s.avgGrossPerRide?.toFixed?.(2) ?? s.avgGrossPerRide],
            ["Offene Settlement-Zeilen (Fin.)", s.openSettlementCount],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{
                padding: 14,
                borderRadius: 8,
                border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
                background: "var(--onroda-surface-2, #f8fafc)",
              }}
            >
              <div className="admin-table-sub" style={{ fontSize: 11, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--onroda-text-dark, #0f172a)" }}>{val}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
