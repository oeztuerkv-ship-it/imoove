import { useCallback, useEffect, useState } from "react";
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
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 1200 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Partner-Anfragen</h1>
      <p style={{ margin: "0 0 20px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 720, lineHeight: 1.5 }}>
        Mandantenbezogene Support-Threads: Antworten setzen den Status auf „beantwortet“. Geschlossene Threads lassen sich
        hier nicht weiter befüllen — der Partner legt ggf. eine neue Anfrage an.
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
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="admin-table-sub">Mandanten-ID</span>
          <input className="admin-input" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} placeholder="co-…" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
          <span className="admin-table-sub">Suche (Titel / ID)</span>
          <input className="admin-input" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
      </div>

      {err ? <div className="admin-error-banner">{err}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 2fr)", gap: 20 }}>
        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: "var(--onroda-surface-2, #f8fafc)", fontWeight: 600 }}>Threads</div>
          <div style={{ maxHeight: 560, overflow: "auto" }}>
            {threads.length === 0 && !loading ? (
              <p style={{ padding: 12, margin: 0, color: "#64748b" }}>Keine Einträge.</p>
            ) : (
              threads.map((t) => (
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
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {t.companyName || t.companyId} · {STATUS_DE[t.status] || t.status} · {fmt(t.lastMessageAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, padding: 16 }}>
          {!selectedId ? (
            <p style={{ color: "#64748b", margin: 0 }}>Links einen Thread wählen.</p>
          ) : detailErr ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !detail?.thread ? (
            <p style={{ color: "#64748b", margin: 0 }}>Lade …</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>{detail.thread.title}</h2>
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
  );
}
