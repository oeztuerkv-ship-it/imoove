import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/messages`;

const MESSAGE_COMPANY_KINDS = [
  "taxi",
  "hotel",
  "insurer",
  "medical",
  "corporate",
  "voucher_client",
  "general",
];

const KIND_LABEL_DE = {
  general: "Allgemein",
  taxi: "Taxi / Mietwagen",
  voucher_client: "Gutscheinpartner",
  insurer: "Krankenkasse / Versicherung",
  hotel: "Hotel",
  corporate: "Unternehmen / Firma",
  medical: "Medizinische Fahrt",
};

function kindLabel(kind) {
  return KIND_LABEL_DE[kind] ?? kind;
}

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
  const [groups, setGroups] = useState([]);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
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
      setGroups(Array.isArray(data.groups) ? data.groups : []);
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
        const allowedKinds = new Set(MESSAGE_COMPANY_KINDS);
        setCompanies(
          items
            .filter((c) => allowedKinds.has(c.company_kind ?? c.companyKind) && c.is_active !== false)
            .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "de")),
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
      const n = data.recipientCount ?? 0;
      const label = typeof data.targetLabel === "string" ? data.targetLabel : "";
      if (data.broadcast) {
        setOkMsg(
          label
            ? `Nachricht (${label}) an ${n} Unternehmen gesendet.`
            : `Nachricht an ${n} Unternehmen gesendet.`,
        );
      } else {
        setOkMsg(n === 1 ? "Nachricht an den Partner gesendet." : `Nachricht an ${n} Partner gesendet.`);
      }
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
          Zielgruppe wählen: alle Partner, nur eine Unternehmensart (Taxi, Hotel, Krankenkasse, …) oder ein
          einzelnes Unternehmen. Posteingang im Partner-Panel und in der Partner-App.
        </p>
      </div>

      <div className="app-news-layout">
        <div className="app-news-main">
          <form onSubmit={onSend} className="app-news-form">
            <label className="admin-form-pair app-news-field--full">
              <span className="admin-field-label">Zielgruppe</span>
              <select className="admin-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <optgroup label="Alle (Standard-Partner)">
                  <option value="alle">Alle Partner (Hotel, Agentur, Medizin, Gutschein, …)</option>
                </optgroup>
                <optgroup label="Nur Unternehmensart">
                  {MESSAGE_COMPANY_KINDS.map((kind) => (
                    <option key={kind} value={`kind:${kind}`}>
                      Alle: {kindLabel(kind)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Einzelnes Unternehmen">
                  {companies.map((c) => {
                    const kind = c.company_kind ?? c.companyKind ?? "";
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name || c.id}
                        {kind ? ` (${kindLabel(kind)})` : ""}
                      </option>
                    );
                  })}
                </optgroup>
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
          <p className="admin-muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}>
            Lesestatus pro Unternehmen — „Empfänger anzeigen“ für Gelesen / Noch nicht gelesen.
          </p>
          {loading ? <p className="admin-muted">Lädt…</p> : null}
          <div className="app-news-list">
            {groups.map((g) => {
              const unread = (g.recipients || []).filter((r) => !r.isRead);
              const read = (g.recipients || []).filter((r) => r.isRead);
              const expanded = expandedGroupKey === g.groupKey;
              const multi = (g.recipientCount ?? 0) > 1;
              return (
                <article key={g.groupKey} className="app-news-list-card">
                  <div className="app-news-list-card__top">
                    <div className="app-news-list-card__title">{g.subject}</div>
                    <span
                      className={`app-news-pill ${
                        g.readCount >= g.recipientCount && g.recipientCount > 0
                          ? "app-news-pill--off"
                          : "app-news-pill--on"
                      }`}
                    >
                      {g.readCount ?? 0} / {g.recipientCount ?? 0} gelesen
                    </span>
                  </div>
                  <p className="app-news-list-card__body">
                    {g.body.length > 120 ? `${g.body.slice(0, 120)}…` : g.body}
                  </p>
                  <dl className="app-news-list-card__meta">
                    <div>
                      <dt>Empfänger</dt>
                      <dd>
                        {multi
                          ? `${g.recipientCount} Unternehmen`
                          : read[0]?.companyName || unread[0]?.companyName || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Gesendet</dt>
                      <dd>{fmtDe(g.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Von</dt>
                      <dd>{g.createdByAdmin || "—"}</dd>
                    </div>
                  </dl>
                  {multi || unread.length > 0 || read.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ marginBottom: expanded ? 10 : 0 }}
                      onClick={() => setExpandedGroupKey(expanded ? null : g.groupKey)}
                    >
                      {expanded ? "Empfänger ausblenden" : "Empfänger & Lesestatus"}
                    </button>
                  ) : null}
                  {expanded ? (
                    <div className="partner-msg-recipients">
                      {unread.length > 0 ? (
                        <div className="partner-msg-recipients__block">
                          <h3 className="partner-msg-recipients__heading partner-msg-recipients__heading--unread">
                            Noch nicht gelesen ({unread.length})
                          </h3>
                          <ul className="partner-msg-recipients__list">
                            {unread.map((r) => (
                              <li key={r.id} className="partner-msg-recipients__row">
                                <span>
                                  {r.companyName || r.companyId}
                                  {r.companyKind ? (
                                    <span className="admin-muted"> · {kindLabel(r.companyKind)}</span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => void onDelete(r.id)}
                                >
                                  Löschen
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {read.length > 0 ? (
                        <div className="partner-msg-recipients__block">
                          <h3 className="partner-msg-recipients__heading partner-msg-recipients__heading--read">
                            Gelesen ({read.length})
                          </h3>
                          <ul className="partner-msg-recipients__list">
                            {read.map((r) => (
                              <li key={r.id} className="partner-msg-recipients__row">
                                <span>
                                  {r.companyName || r.companyId}
                                  {r.companyKind ? (
                                    <span className="admin-muted"> · {kindLabel(r.companyKind)}</span>
                                  ) : null}
                                  {r.readAt ? (
                                    <span className="admin-muted"> · {fmtDe(r.readAt)}</span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => void onDelete(r.id)}
                                >
                                  Löschen
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!expanded && !multi && (g.recipients || [])[0] ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void onDelete(g.recipients[0].id)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
