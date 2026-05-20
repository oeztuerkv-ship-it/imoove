import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/driver-messages`;

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

function driverLabel(d) {
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim();
  return name || d.email || d.id;
}

export default function DriverMessagesPage() {
  const [mode, setMode] = useState("broadcast");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState("");

  const preview = useMemo(
    () => ({
      title: title.trim() || "Titel der Nachricht",
      body: body.trim() || "Text der Nachricht …",
    }),
    [title, body],
  );

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
    fetch(`${API_BASE}/admin/taxi-fleet-drivers/taxi-companies`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => setCompanies(Array.isArray(j.items) ? j.items : []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setDrivers([]);
      setDriverId("");
      return;
    }
    fetch(`${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers`, {
      headers: adminApiHeaders(),
    })
      .then((r) => r.json())
      .then((j) => setDrivers(Array.isArray(j.drivers) ? j.drivers : []))
      .catch(() => setDrivers([]));
  }, [companyId]);

  async function onSend(e) {
    e.preventDefault();
    setSending(true);
    setError("");
    setOkMsg("");
    try {
      const payload = { title: title.trim(), body: body.trim() };
      if (!payload.title || !payload.body) throw new Error("title_body_required");
      let url = `${BASE}/broadcast`;
      let bodyJson = payload;
      if (mode === "single") {
        if (!driverId) throw new Error("driver_id_required");
        url = `${BASE}/single`;
        bodyJson = { ...payload, driverId, companyId: companyId || undefined };
      }
      const res = await adminFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyJson),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) throw new Error(formatFailure(res, data));
      const pushN = data.push?.attempted ?? 0;
      setOkMsg(
        mode === "broadcast"
          ? `Sammelnachricht gesendet (Push an ${pushN} Gerät(e)).`
          : `Nachricht gesendet (Push an ${pushN} Gerät(e)).`,
      );
      setTitle("");
      setBody("");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-page admin-page--loose app-news-page driver-messages-page">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      {okMsg ? (
        <div className="admin-panel-card" style={{ marginBottom: 12 }}>
          {okMsg}
        </div>
      ) : null}

      <div className="app-news-hero">
        <h1 className="app-news-hero__title">Fahrer-Nachrichten</h1>
        <p className="app-news-hero__sub">
          Push und In-App-Historie für alle Fahrer oder einen einzelnen Fahrer. API:{" "}
          <code className="app-news-hero__code">POST /api/admin/driver-messages/broadcast</code> bzw.{" "}
          <code className="app-news-hero__code">/single</code>
        </p>
      </div>

      <div className="app-news-layout">
        <div className="app-news-main">
          <div className="driver-messages-phone" aria-label="Vorschau Handy">
            <div className="driver-messages-phone__shell">
              <div className="driver-messages-phone__notch" />
              <div className="driver-messages-phone__screen">
                <div className="driver-messages-phone__appbar">Onroda · Nachricht</div>
                <div className="driver-messages-phone__card">
                  <div className="driver-messages-phone__title">{preview.title}</div>
                  <p className="driver-messages-phone__body">{preview.body}</p>
                  <div className="driver-messages-phone__time">Jetzt</div>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={onSend} className="app-news-form">
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                className={mode === "broadcast" ? "btn btn-red" : "btn btn-outline"}
                onClick={() => setMode("broadcast")}
              >
                Alle Fahrer
              </button>
              <button
                type="button"
                className={mode === "single" ? "btn btn-red" : "btn btn-outline"}
                onClick={() => setMode("single")}
              >
                Einzelner Fahrer
              </button>
            </div>

            {mode === "single" ? (
              <div className="app-news-section__grid app-news-section__grid--2" style={{ marginBottom: 12 }}>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Taxi-Unternehmen</span>
                  <select className="admin-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    <option value="">— wählen —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form-pair">
                  <span className="admin-field-label">Fahrer</span>
                  <select
                    className="admin-select"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    disabled={!companyId}
                  >
                    <option value="">— wählen —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {driverLabel(d)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="app-news-section__grid">
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Titel (Push + In-App)</span>
                <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </label>
              <label className="admin-form-pair app-news-field--full">
                <span className="admin-field-label">Text</span>
                <textarea className="admin-textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn btn-red" disabled={sending}>
              {sending ? "Sendet…" : mode === "broadcast" ? "An alle Fahrer senden" : "An Fahrer senden"}
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
                  <div className="app-news-list-card__title">{m.title}</div>
                  <span className="app-news-pill app-news-pill--on">{m.targetDriverId ? "Einzel" : "Alle"}</span>
                </div>
                <p className="app-news-list-card__body">{m.body}</p>
                <dl className="app-news-list-card__meta">
                  <div>
                    <dt>Empfänger</dt>
                    <dd>{m.targetDriverId ? m.targetDriverLabel || m.targetDriverId : "Alle Fahrer"}</dd>
                  </div>
                  <div>
                    <dt>Gesendet</dt>
                    <dd>{fmtDe(m.sentAt)}</dd>
                  </div>
                  <div>
                    <dt>Von</dt>
                    <dd>{m.sentBy || "—"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}