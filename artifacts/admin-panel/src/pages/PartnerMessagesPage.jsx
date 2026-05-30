import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/messages`;

function fmtDe(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

async function readJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }
  return { data, text };
}

function formatFailure(res, data) {
  if (typeof data?.error === "string") return data.error;
  return `HTTP ${res.status}`;
}

export default function PartnerMessagesPage() {
  const [companyId, setCompanyId] = useState("alle");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(BASE);
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    fetch(`${API_BASE}/admin/companies`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => {
        const items = Array.isArray(j.companies) ? j.companies : Array.isArray(j.items) ? j.items : [];
        const partnerKinds = new Set(["hotel", "corporate", "voucher_client", "general", "medical"]);
        setCompanies(
          items.filter((c) => partnerKinds.has(c.company_kind ?? c.companyKind) && c.is_active !== false),
        );
      })
      .catch(() => setCompanies([]));
  }, []);

  async function onDelete(messageId) {
    if (!window.confirm("Diese Nachricht wirklich löschen?")) return;
    setError("");
    setOkMsg("");
    try {
      const res = await adminFetch(`${BASE}/${encodeURIComponent(messageId)}`, { method: "DELETE" });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      setOkMsg("Nachricht gelöscht.");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function onSend(e) {
    e.preventDefault();
    setSending(true);
    setError("");
    setOkMsg("");
    try {
      const sub = subject.trim();
      const txt = body.trim();
      if (!sub || !txt) throw new Error("subject_body_required");
      const res = await adminFetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId === "alle" ? "alle" : companyId,
          subject: sub,
          body: txt,
        }),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      setOkMsg(
        data.broadcast
          ? `Nachricht an ${data.recipientCount ?? 0} Partner-Unternehmen gesendet.`
          : "Nachricht an den Partner gesendet.",
      );
      setSubject("");
      setBody("");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-page admin-page--loose app-news-page partner-messages-page">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      {okMsg ? (
        <div className="admin-panel-card" style={{ marginBottom: 12 }}>
          {okMsg}
        </div>
      ) : null}

      <div className="app-news-hero">
        <h1 className="app-news-hero__title">Nachrichten an Partner</h1>
        <p className="app-news-hero__sub">
          Einweg-Posteingang für Hotel- und Partner-Mandanten (Web + Mobile). API:{" "}
          <code className="app-news-hero__code">POST /api/admin/messages</code>
        </p>
      </div>

      <div className="app-news-layout">
        <div className="app-news-main">
          <form onSubmit={onSend} className="app-news-form">
            <label className="admin-form-pair app-news-field--full">
              <span className="admin-field-label">Empfänger</span>
              <select className="admin-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="alle">Alle Partner-Unternehmen</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="app-news-section__grid">
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Betreff</span>
                <input
                  className="admin-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Nachricht</span>
                <textarea className="admin-textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn btn-red" disabled={sending}>
              {sending ? "Sendet…" : "Nachricht senden"}
            </button>
          </form>
        </div>

        <aside className="app-news-sidebar">
          <h2 className="app-news-sidebar__title">Gesendete Nachrichten</h2>
          {loading ? <p className="admin-muted">Lädt…</p> : null}
          <div className="app-news-list">
            {history.map((m) => (
              <article key={m.id} className="app-news-list-card">
                <div className="app-news-list-card__top">
                  <div className="app-news-list-card__title">{m.subject}</div>
                  <span
                    className={`app-news-pill ${m.isRead ? "app-news-pill--off" : "app-news-pill--on"}`}
                  >
                    {m.isRead ? "Gelesen" : "Ungelesen"}
                  </span>
                </div>
                <p className="app-news-list-card__body">{m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body}</p>
                <dl className="app-news-list-card__meta">
                  <div>
                    <dt>Empfänger</dt>
                    <dd>{m.companyName || m.companyId}</dd>
                  </div>
                  <div>
                    <dt>Gesendet</dt>
                    <dd>{fmtDe(m.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Von</dt>
                    <dd>{m.createdByAdmin || "—"}</dd>
                  </div>
                </dl>
                <button type="button" className="btn btn-outline" onClick={() => void onDelete(m.id)}>
                  Löschen
                </button>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
