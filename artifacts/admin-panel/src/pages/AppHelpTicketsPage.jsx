import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/app-help-tickets`;

const STATUS_OPTS = [
  { value: "", label: "Alle Status" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "resolved", label: "Gelöst" },
];

const STATUS_DE = { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" };

const CAT_DE = {
  booking: "Buchung",
  account: "Konto",
  payment: "Zahlung",
  app_issue: "App / Technik",
  other: "Sonstiges",
};

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function AppHelpTicketsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const [internalNote, setInternalNote] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const u = new URL(LIST_URL);
      u.searchParams.set("page", "1");
      u.searchParams.set("pageSize", "100");
      if (filterStatus) u.searchParams.set("status", filterStatus);
      if (filterQ.trim()) u.searchParams.set("q", filterQ.trim());
      const res = await fetch(u.toString(), { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterQ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}`, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetail(null);
        setDetailErr(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
        return;
      }
      setDetail(data.ticket);
      setInternalNote(data.ticket?.internalNote != null ? String(data.ticket.internalNote) : "");
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function patchTicket(payload) {
    if (!selectedId) return;
    setPatchBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Aktualisieren fehlgeschlagen.");
        return;
      }
      setDetail(data.ticket);
      if (data.ticket) setInternalNote(data.ticket.internalNote != null ? String(data.ticket.internalNote) : "");
      await loadList();
    } catch {
      setDetailErr("Aktualisieren fehlgeschlagen.");
    } finally {
      setPatchBusy(false);
    }
  }

  return (
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 1200 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>App-Hilfe (Kund*innen)</h1>
      <p style={{ margin: "0 0 20px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 800, lineHeight: 1.5 }}>
        Anfragen aus dem Tab <strong>Hilfe</strong> in der Kunden-App (ohne Fahrtbezug). Status und interne Notiz werden hier
        bearbeitet.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="admin-table-sub">Status</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="admin-input">
            {STATUS_OPTS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <span className="admin-table-sub">Suche (Ticket / E-Mail / Text)</span>
          <input className="admin-input" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
        <span className="admin-table-sub" style={{ marginLeft: 8 }}>
          {total} Treffer
        </span>
      </div>

      {err ? <div className="admin-error-banner">{err}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(0, 2fr)", gap: 20 }}>
        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: "var(--onroda-surface-2, #f8fafc)", fontWeight: 600 }}>Tickets</div>
          <div style={{ maxHeight: 600, overflow: "auto" }}>
            {items.length === 0 && !loading ? (
              <p style={{ padding: 12, margin: 0, color: "#64748b" }}>Keine Einträge.</p>
            ) : (
              items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #eee",
                    background: t.id === selectedId ? "#e0f2fe" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12 }}><code>{t.id}</code></div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{CAT_DE[t.category] || t.category}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {t.passengerEmail} · {STATUS_DE[t.status] || t.status} · {fmt(t.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, padding: 16 }}>
          {!selectedId ? (
            <p style={{ color: "#64748b", margin: 0 }}>Links ein Ticket wählen.</p>
          ) : detailErr ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !detail ? (
            <p style={{ color: "#64748b", margin: 0 }}>Lade …</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>{CAT_DE[detail.category] || detail.category}</h2>
                  <div className="admin-table-sub">
                    {detail.passengerName || "—"} · {detail.passengerEmail}
                    {detail.passengerPhone ? ` · ${detail.passengerPhone}` : ""}
                  </div>
                  <div className="admin-table-sub" style={{ marginTop: 4 }}>
                    Passagier-ID <code>{detail.passengerId}</code> · {fmt(detail.createdAt)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                  <span className="admin-table-sub">Status</span>
                  <select
                    className="admin-input"
                    value={detail.status}
                    disabled={patchBusy}
                    onChange={(e) => void patchTicket({ status: e.target.value })}
                  >
                    {STATUS_OPTS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {detail.subject ? (
                <div style={{ marginBottom: 8 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 4 }}>
                    Betreff
                  </div>
                  <div>{detail.subject}</div>
                </div>
              ) : null}

              <div style={{ marginBottom: 12 }}>
                <div className="admin-table-sub" style={{ marginBottom: 4 }}>
                  Nachricht (Kund*in)
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{detail.message}</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div className="admin-table-sub" style={{ marginBottom: 4 }}>Interne Plattform-Notiz (nicht sichtbar für Kund*in)</div>
                <textarea
                  className="admin-input"
                  rows={3}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  style={{ width: "100%" }}
                />
                <button
                  type="button"
                  className="admin-c-btn-sec"
                  style={{ marginTop: 6 }}
                  disabled={patchBusy}
                  onClick={() => void patchTicket({ internalNote })}
                >
                  {patchBusy ? "…" : "Notiz speichern"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
