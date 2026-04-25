import { useCallback, useEffect, useState } from "react";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { insurerExportDownloadUrl, insurerExportsListUrl, insurerExportsPostUrl } from "../lib/insurerApi.js";

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to) };
}

export default function InsurerExportsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [range, setRange] = useState(defaultRange);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(insurerExportsListUrl({ limit: 50 }), { headers: adminApiHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr("Exportliste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch(insurerExportsPostUrl, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          periodFrom: range.from,
          periodTo: range.to,
          companyId: companyId.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error === "period_from_to_required" ? "Von/bis wählen." : "Export fehlgeschlagen.");
        return;
      }
      setMsg(`Export erstellt: ${j.batchId} (${j.rowCount} Zeilen).`);
      await load();
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(id) {
    try {
      const res = await fetch(insurerExportDownloadUrl(id), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("Download nicht möglich.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `insurance-export-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Download fehlgeschlagen.");
    }
  }

  return (
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Krankenkassen · Exporte</h1>
      <p style={{ margin: "0 0 16px", color: "var(--onroda-text-muted, #64748b)", lineHeight: 1.5 }}>
        CSV-Export (Schema <code>insurer_export_v1</code>) nur Fahrten mit <code>payer_kind = insurance</code>. Datei serverseitig abgelegt, Download mit Admin-Bearer.
      </p>
      <div
        style={{
          marginBottom: 20,
          padding: 14,
          border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
          borderRadius: 8,
        }}
      >
        <h3 className="admin-table-sub" style={{ margin: "0 0 10px" }}>
          Neuen Export anlegen
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
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
            <input className="admin-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="co-…" style={{ minWidth: 200 }} />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => void onCreate()} disabled={busy}>
            {busy ? "Erzeuge…" : "CSV erzeugen"}
          </button>
        </div>
        {msg ? <div className="admin-info-banner" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>
      {err ? <div className="admin-error-banner">{err}</div> : null}
      <h3 className="admin-table-sub" style={{ margin: "0 0 8px" }}>
        Letzte Batches
      </h3>
      <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading} style={{ marginBottom: 8 }}>
        {loading ? "Lade…" : "Aktualisieren"}
      </button>
      <div style={{ overflow: "auto", border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8 }}>
        <table className="admin-table" style={{ minWidth: 700, width: "100%" }}>
          <thead>
            <tr>
              <th>Batch-ID</th>
              <th>Zeitraum</th>
              <th>Zeilen</th>
              <th>Schema</th>
              <th>Erstellt</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="admin-table-sub" style={{ padding: 12 }}>
                  Noch keine Exporte.
                </td>
              </tr>
            ) : (
              items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <code style={{ fontSize: 11 }}>{b.id}</code>
                  </td>
                  <td>
                    {fmt(b.periodFrom)} – {fmt(b.periodTo)}
                  </td>
                  <td>{b.rowCount}</td>
                  <td>{b.schemaVersion}</td>
                  <td>{fmt(b.createdAt)}</td>
                  <td>
                    {b.hasFile ? (
                      <button type="button" className="admin-btn-primary" onClick={() => void onDownload(b.id)}>
                        CSV
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
