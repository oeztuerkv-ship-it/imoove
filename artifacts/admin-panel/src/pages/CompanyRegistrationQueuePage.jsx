import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const PENDING_LIST = `${API_BASE}/admin/company-registration-requests?pending=1`;

function detailUrl(id) {
  return `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(id)}`;
}

function downloadDocUrl(requestId, docId) {
  return `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(docId)}/download`;
}

const REG_STATUS = [
  { value: "open", label: "Eingereicht" },
  { value: "in_review", label: "In Prüfung" },
  { value: "documents_required", label: "Dokumente erforderlich" },
  { value: "approved", label: "Freigegeben" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "blocked", label: "Gesperrt" },
];

const REG_STATUS_DE = Object.fromEntries(REG_STATUS.map((o) => [o.value, o.label]));

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function CompanyRegistrationQueuePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [regStatus, setRegStatus] = useState("open");
  const [adminNote, setAdminNote] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(PENDING_LIST, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const res = await fetch(detailUrl(id), { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetail(null);
        setDetailErr(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
        return;
      }
      const req = data.request;
      if (!req) {
        setDetail(null);
        setDetailErr("Ungültige API-Antwort.");
        return;
      }
      setDetail({
        request: req,
        documents: Array.isArray(data.documents) ? data.documents : [],
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
      });
      setRegStatus(String(req.registrationStatus ?? "open"));
      setAdminNote(String(req.adminNote ?? ""));
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function downloadDocument(requestId, docId) {
    try {
      const res = await fetch(downloadDocUrl(requestId, docId), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("Datei konnte nicht geladen werden.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.alert("Datei konnte nicht geöffnet werden.");
    }
  }

  async function saveRequestMeta() {
    if (!selectedId) return;
    setSaveBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(detailUrl(selectedId), {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: regStatus, adminNote: adminNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : "Speichern fehlgeschlagen.",
        );
        return;
      }
      await loadList();
      await loadDetail(selectedId);
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 1200 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Registrierungsanfragen</h1>
      <p style={{ margin: "0 0 20px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 720, lineHeight: 1.5 }}>
        Homepage-Partnerbewerbungen (separat von den mandanteninternen <strong>Partner-Anfragen</strong> / Support-Threads). Hier
        bearbeiten Sie offene Eingänge, Dokumente und Prüfstatus, bevor ein Mandat angelegt oder verknüpft wird.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
      </div>
      {err ? <div className="admin-error-banner">{err}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 2fr)", gap: 20 }}>
        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: "var(--onroda-surface-2, #f8fafc)", fontWeight: 600 }}>Warteschlange</div>
          <div style={{ maxHeight: 560, overflow: "auto" }}>
            {items.length === 0 && !loading ? (
              <p style={{ padding: 12, margin: 0, color: "#64748b" }}>Keine offenen Anfragen.</p>
            ) : (
              items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #eee",
                    background: r.id === selectedId ? "#e0f2fe" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.companyName || "—"}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {REG_STATUS_DE[r.registrationStatus] || r.registrationStatus} · {fmt(r.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, padding: 16 }}>
          {!selectedId ? (
            <p style={{ color: "#64748b", margin: 0 }}>Links eine Anfrage wählen.</p>
          ) : detailErr ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !detail?.request ? (
            <p style={{ color: "#64748b", margin: 0 }}>Lade …</p>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>{detail.request.companyName}</h2>
              <div className="admin-table-sub" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                {detail.request.email} · {detail.request.partnerType} · {detail.request.city}
              </div>
              {detail.request.linkedCompanyId ? (
                <p className="admin-table-sub" style={{ margin: "0 0 10px" }}>
                  Verknüpft: <code>{detail.request.linkedCompanyId}</code>
                </p>
              ) : null}
              <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="admin-table-sub">Status</span>
                  <select className="admin-input" value={regStatus} onChange={(e) => setRegStatus(e.target.value)}>
                    {REG_STATUS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="admin-table-sub">Interne Notiz</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
                <button type="button" className="admin-btn-primary" onClick={() => void saveRequestMeta()} disabled={saveBusy}>
                  {saveBusy ? "Speichern…" : "Speichern"}
                </button>
              </div>
              <h3 style={{ fontSize: "0.95rem", margin: "20px 0 8px" }}>Dokumente</h3>
              {detail.documents.length === 0 ? (
                <p className="admin-table-sub">Noch keine Dokumente hinterlegt.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {detail.documents.map((d) => (
                    <li key={d.id} style={{ marginBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => void downloadDocument(d.requestId, d.id)}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--onroda-accent-strong, #0ea5e9)", cursor: "pointer", textAlign: "left" }}
                      >
                        {d.originalFileName} ({d.category})
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <h3 style={{ fontSize: "0.95rem", margin: "20px 0 8px" }}>Verlauf</h3>
              <div style={{ maxHeight: 280, overflow: "auto" }}>
                {detail.timeline
                  .slice()
                  .reverse()
                  .map((ev) => (
                    <p key={ev.id} className="admin-table-sub" style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
                      <strong>{fmt(ev.createdAt)}</strong> — {ev.message}
                    </p>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
