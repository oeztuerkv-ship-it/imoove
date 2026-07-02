import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/support/threads`;

const STATUS_OPTS = [
  { value: "", label: "Alle Status" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "answered", label: "Beantwortet" },
  { value: "closed", label: "Geschlossen" },
];

const STATUS_DE = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  answered: "Beantwortet",
  closed: "Geschlossen",
};

const CAT_DE = {
  stammdaten: "Stammdaten",
  documents: "Dokumente",
  billing: "Abrechnung",
  technical: "Technisch",
  other: "Sonstiges",
};

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function SupportInboxPage() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [reply, setReply] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [patchBusy, setPatchBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const u = new URL(LIST_URL);
      u.searchParams.set("page", "1");
      u.searchParams.set("pageSize", "50");
      if (filterStatus) u.searchParams.set("status", filterStatus);
      if (filterCompany.trim()) u.searchParams.set("companyId", filterCompany.trim());
      if (filterQ.trim()) u.searchParams.set("q", filterQ.trim());
      const res = await fetch(u.toString(), { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setThreads([]);
        return;
      }
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch {
      setErr("Netzwerkfehler.");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCompany, filterQ]);

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
      setDetail({
        thread: data.thread,
        messages: Array.isArray(data.messages) ? data.messages : [],
        companyName: data.companyName ?? "",
      });
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSendBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (res.status === 409) setDetailErr("Thread ist geschlossen — keine weiteren Nachrichten.");
        else setDetailErr(typeof data?.error === "string" ? data.error : "Senden fehlgeschlagen.");
        return;
      }
      setReply("");
      await loadList();
      await loadDetail(selectedId);
    } catch {
      setDetailErr("Senden fehlgeschlagen.");
    } finally {
      setSendBusy(false);
    }
  }

  async function patchStatus(next) {
    if (!selectedId) return;
    setPatchBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Status-Update fehlgeschlagen.");
        return;
      }
      await loadList();
      await loadDetail(selectedId);
    } catch {
      setDetailErr("Status-Update fehlgeschlagen.");
    } finally {
      setPatchBusy(false);
    }
  }

  const closed = detail?.thread?.status === "closed";

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Mandantenbezogene Support-Threads: Antworten setzen den Status auf „beantwortet“. Geschlossene Threads lassen sich
        hier nicht weiter befüllen — der Partner legt ggf. eine neue Anfrage an.
      </p>

      {err ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{err}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Filter" defaultOpen>
        <div className="admin-filter-toolbar admin-filter-toolbar--modern">
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
          <label className="admin-filter-field">
            <span className="admin-field-label">Mandanten-ID</span>
            <input className="admin-input" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} placeholder="co-…" />
          </label>
          <label className="admin-filter-field admin-filter-field--wide">
            <span className="admin-field-label">Suche (Titel / ID)</span>
            <input className="admin-input" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
          </label>
          <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
      </AdminCollapsibleSection>

      <div className="admin-split-layout">
        <div className="admin-split-pane">
          <div className="admin-split-pane__head">Threads</div>
          <div className="admin-split-pane__list">
            {threads.length === 0 && !loading ? (
              <p className="admin-split-list-empty">Keine Einträge.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`admin-split-list-btn${t.id === selectedId ? " admin-split-list-btn--active" : ""}`}
                >
                  <div className="admin-split-list-btn__title">{t.title}</div>
                  <div className="admin-split-list-btn__meta">
                    {t.companyName || t.companyId} · {STATUS_DE[t.status] || t.status} · {fmt(t.lastMessageAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="admin-split-pane">
          <div className="admin-split-pane__body">
          {!selectedId ? (
            <p className="admin-split-list-empty">Links einen Thread wählen.</p>
          ) : detailErr ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !detail?.thread ? (
            <p className="admin-split-list-empty">Lade …</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <h2 className="admin-split-detail-title">{detail.thread.title}</h2>
                  <div className="admin-table-sub">
                    {detail.companyName} ({detail.thread.companyId}) · {CAT_DE[detail.thread.category] || detail.thread.category}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                  <span className="admin-table-sub">Status setzen</span>
                  <select
                    className="admin-input"
                    value={detail.thread.status}
                    disabled={patchBusy}
                    onChange={(e) => void patchStatus(e.target.value)}
                  >
                    {STATUS_OPTS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ maxHeight: 320, overflow: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: m.senderType === "admin" ? "#ecfeff" : "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                      {m.senderType === "admin" ? "Plattform" : "Partner"} · {fmt(m.createdAt)}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.body}</div>
                  </div>
                ))}
              </div>
              {closed ? (
                <p className="admin-table-sub">Geschlossen — keine neuen Nachrichten.</p>
              ) : (
                <>
                  <textarea
                    className="admin-input"
                    rows={4}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Antwort an den Mandanten …"
                    style={{ width: "100%", marginBottom: 10 }}
                  />
                  <button type="button" className="admin-btn-primary" disabled={sendBusy || !reply.trim()} onClick={() => void sendReply()}>
                    {sendBusy ? "Senden…" : "Antwort senden"}
                  </button>
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
