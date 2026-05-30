import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/ride-support-tickets`;

const STATUS_OPTS = [
  { value: "", label: "Alle Status" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "resolved", label: "Gelöst" },
];

const STATUS_DE = { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" };

const CAT_DE = {
  driver_not_arrived: "Fahrer nicht da",
  wrong_price: "Falscher Preis",
  wrong_address: "Falsche Adresse",
  cancel_or_issue: "Storno/Problem",
  payment_receipt: "Zahlung/Beleg",
  special_request: "Sonderwunsch",
  other: "Sonstiges",
};

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function SnapshotView({ snap }) {
  if (!snap || typeof snap !== "object") {
    return <p className="admin-table-sub">—</p>;
  }
  return (
    <pre
      className="admin-ride-snapshot-pre"
      style={{
        maxHeight: 400,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.4,
        padding: 12,
        background: "var(--onroda-surface-2, #f8fafc)",
        border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
        borderRadius: 8,
        margin: 0,
      }}
    >
      {JSON.stringify(snap, null, 2)}
    </pre>
  );
}

export default function RideSupportTicketsPage() {
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
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Tickets aus der Kunden-App mit <strong>unveränderbarem Fahrtkontext</strong> (Snapshot zum Zeitpunkt der Meldung). Keine
        E-Mail, kein Chat — Plattform-Bearbeitung, interne Notiz, Status.
      </p>

      {err ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{err}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Filter" subtitle={`${total} Treffer`} defaultOpen>
        <div className="admin-filter-toolbar">
          <label className="admin-filter-field">
            <span className="admin-field-label">Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="admin-input">
              {STATUS_OPTS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field admin-filter-field--wide">
            <span className="admin-field-label">Suche (Ticket / Fahrt / Passagier-ID)</span>
            <input className="admin-input" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
      </AdminCollapsibleSection>

      <div className="admin-split-layout">
        <div className="admin-split-pane">
          <div className="admin-split-pane__head">Tickets</div>
          <div className="admin-split-pane__list">
            {items.length === 0 && !loading ? (
              <p className="admin-split-list-empty">Keine Einträge.</p>
            ) : (
              items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`admin-split-list-btn${t.id === selectedId ? " admin-split-list-btn--active" : ""}`}
                >
                  <div className="admin-split-list-btn__title">
                    <code>{t.id}</code>
                  </div>
                  <div className="admin-split-list-btn__meta">{CAT_DE[t.category] || t.category}</div>
                  <div className="admin-split-list-btn__meta">
                    Fahrt <code>{t.rideId}</code> · {STATUS_DE[t.status] || t.status} · {fmt(t.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="admin-split-pane">
          <div className="admin-split-pane__body">
          {!selectedId ? (
            <p className="admin-split-list-empty">Links ein Ticket wählen.</p>
          ) : detailErr ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !detail ? (
            <p className="admin-split-list-empty">Lade …</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <h2 className="admin-split-detail-title">{CAT_DE[detail.category] || detail.category}</h2>
                  <div className="admin-table-sub">
                    Fahrt <code>{detail.rideId}</code> · Passagier-ID <code>{detail.passengerId}</code>
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
              {detail.message ? (
                <div style={{ marginBottom: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 4 }}>
                    Nachricht (Kund*in)
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{detail.message}</div>
                </div>
              ) : (
                <p className="admin-table-sub" style={{ marginBottom: 12 }}>Kein Freitext (nur Kategorie)</p>
              )}

              <div style={{ marginBottom: 12 }}>
                <div className="admin-table-sub" style={{ marginBottom: 4 }}>Interne Plattform-Notiz (nicht sichtbar für Kund*in/Partner)</div>
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

              <div style={{ marginTop: 16 }}>
                <div className="admin-table-sub" style={{ marginBottom: 8 }}>
                  Fahrtkontext (Snapshot v{detail.snapshotSchemaVersion} · {fmt(detail.snapshotCapturedAt)})
                </div>
                <SnapshotView snap={detail.rideContextSnapshot} />
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
