import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
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
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        CSV-Export (Schema <code>insurer_export_v1</code>) nur Fahrten mit <code>payer_kind = insurance</code>. Datei serverseitig abgelegt, Download mit Admin-Bearer.
      </p>

      {err ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{err}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Neuen Export anlegen" defaultOpen>
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
            <input className="admin-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="co-…" />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => void onCreate()} disabled={busy}>
            {busy ? "Erzeuge…" : "CSV erzeugen"}
          </button>
        </div>
        {msg ? <div className="admin-info-banner admin-info-banner--inline" style={{ marginTop: 10 }}>{msg}</div> : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Letzte Batches" subtitle={`${items.length} Einträge`} defaultOpen>
        <div className="admin-section-toolbar admin-section-toolbar--start" style={{ marginBottom: 8 }}>
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card admin-table-card--embedded">
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
      </AdminCollapsibleSection>
    </div>
  );
}
