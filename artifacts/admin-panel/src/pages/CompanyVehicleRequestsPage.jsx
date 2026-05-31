import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/company-vehicle-requests`;

const ONB_DE = {
  incomplete: "Unvollständig",
  pending: "Eingereicht",
  approved: "Freigegeben",
};

const REVIEW_DE = {
  draft: "Entwurf",
  pending: "In Prüfung",
  active: "Aktiv",
  inactive: "Deaktiviert",
  rejected: "Abgelehnt",
};

const DOC_DE = {
  gewerbeschein: "Gewerbeschein",
  konzession: "Konzession",
  fahrzeugschein: "Fahrzeugschein",
  versicherung: "Versicherung",
  ik_nachweis: "IK-Nachweis",
  personalausweis: "Personalausweis",
  sepa: "SEPA",
  kk_vertrag: "KK-Vertrag",
  sonstige: "Sonstige",
};

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function docFileUrl(companyId, docId) {
  return `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(docId)}/file`;
}

export default function CompanyVehicleRequestsPage({ onOpenCompany }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filterMode, setFilterMode] = useState("pending");
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [busy, setBusy] = useState("");
  const [reply, setReply] = useState("");
  const [replyVehicleId, setReplyVehicleId] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const u = new URL(LIST_URL);
      u.searchParams.set("status", filterMode);
      const res = await fetch(u.toString(), { headers: adminApiHeaders() });
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
  }, [filterMode]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (companyId) => {
    if (!companyId) {
      setDetail(null);
      return;
    }
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(companyId)}`, {
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetail(null);
        setDetailErr(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
        return;
      }
      setDetail({
        profile: data.profile,
        vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
        documents: Array.isArray(data.documents) ? data.documents : [],
        messages: Array.isArray(data.messages) ? data.messages : [],
      });
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedCompanyId);
  }, [selectedCompanyId, loadDetail]);

  const docsByVehicle = useMemo(() => {
    const map = new Map();
    if (!detail?.documents) return map;
    for (const d of detail.documents) {
      const key = d.vehicleId || "_company";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return map;
  }, [detail?.documents]);

  async function openDoc(companyId, docId) {
    try {
      const res = await fetch(docFileUrl(companyId, docId), { headers: adminApiHeaders() });
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

  async function setVehicleReview(vehicleId, reviewStatus, operatorMessage) {
    if (!selectedCompanyId) return;
    setBusy(`v-${vehicleId}-${reviewStatus}`);
    setDetailErr("");
    try {
      const res = await fetch(
        `${LIST_URL}/${encodeURIComponent(selectedCompanyId)}/vehicles/${encodeURIComponent(vehicleId)}`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewStatus,
            operatorMessage: operatorMessage?.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Aktion fehlgeschlagen.");
        return;
      }
      await loadList();
      await loadDetail(selectedCompanyId);
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setBusy("");
    }
  }

  async function sendReply() {
    if (!selectedCompanyId || !reply.trim()) return;
    setBusy("msg");
    setDetailErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(selectedCompanyId)}/messages`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          body: reply.trim(),
          vehicleId: replyVehicleId.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Nachricht fehlgeschlagen.");
        return;
      }
      setReply("");
      await loadDetail(selectedCompanyId);
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Taxi-Mandanten: eingereichte Fahrzeuge mit Konzession und Fahrzeugschein prüfen, aktivieren oder deaktivieren und
        dem Unternehmen antworten. Flotten-Fahrzeuge (Betrieb) weiter unter „Fahrzeuge prüfen“.
      </p>

      {err || detailErr ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body admin-section-block__body--stack">
            {err ? <div className="admin-error-banner admin-info-banner--inline">{err}</div> : null}
            {detailErr ? <div className="admin-error-banner admin-info-banner--inline">{detailErr}</div> : null}
          </div>
        </section>
      ) : null}

      <div className="admin-filter-toolbar" style={{ marginBottom: 16 }}>
        <label className="admin-filter-field">
          <span className="admin-field-label">Anzeige</span>
          <select className="admin-input" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
            <option value="pending">Offen (eingereicht / in Prüfung)</option>
            <option value="all">Alle Taxi-Mandanten</option>
          </select>
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
      </div>

      <div className="admin-split-layout">
        <div className="admin-split-pane">
          <div className="admin-split-pane__head">Unternehmen</div>
          <div className="admin-split-pane__list">
            {items.length === 0 && !loading ? (
              <p className="admin-split-list-empty">Keine offenen Anfragen.</p>
            ) : (
              items.map((row) => (
                <button
                  key={row.companyId}
                  type="button"
                  onClick={() => {
                    setSelectedCompanyId(row.companyId);
                    setReplyVehicleId("");
                  }}
                  className={`admin-split-list-btn${row.companyId === selectedCompanyId ? " admin-split-list-btn--active" : ""}`}
                >
                  <div className="admin-split-list-btn__title">{row.companyName || row.companyId}</div>
                  <div className="admin-split-list-btn__meta">
                    {ONB_DE[row.onboardingStatus] || row.onboardingStatus}
                    {row.pendingVehicleCount > 0 ? ` · ${row.pendingVehicleCount} Fzg. in Prüfung` : ""}
                    {row.hasKonzessionDoc && row.hasFahrzeugscheinDoc ? " · Nachweise" : ""}
                  </div>
                  {row.lastSubmittedAt ? (
                    <div className="admin-split-list-btn__meta">Zuletzt: {fmt(row.lastSubmittedAt)}</div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="admin-split-pane">
          <div className="admin-split-pane__body">
            {!selectedCompanyId ? (
              <p className="admin-split-list-empty">Links ein Unternehmen wählen.</p>
            ) : !detail?.profile ? (
              <p className="admin-split-list-empty">Lade …</p>
            ) : (
              <div className="admin-stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2 className="admin-split-detail-title">{detail.profile.name}</h2>
                    <div className="admin-table-sub">
                      {selectedCompanyId} · Onboarding: {ONB_DE[detail.profile.onboardingStatus] || detail.profile.onboardingStatus}
                    </div>
                    {detail.profile.concessionNumber ? (
                      <div className="admin-table-sub">Konzession (Stamm): {detail.profile.concessionNumber}</div>
                    ) : null}
                  </div>
                  {typeof onOpenCompany === "function" ? (
                    <button
                      type="button"
                      className="admin-btn-secondary"
                      onClick={() => onOpenCompany(selectedCompanyId)}
                    >
                      Mandantenzentrale
                    </button>
                  ) : null}
                </div>

                <section>
                  <h3 className="admin-section-block__title">Fahrzeuge</h3>
                  {detail.vehicles.length === 0 ? (
                    <p className="admin-text-muted">Keine Fahrzeuge hinterlegt.</p>
                  ) : (
                    <ul className="admin-list-plain" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {detail.vehicles.map((v) => {
                        const vDocs = docsByVehicle.get(v.id) ?? [];
                        const hasKon = vDocs.some((d) => d.docType === "konzession");
                        const hasFs = vDocs.some((d) => d.docType === "fahrzeugschein");
                        return (
                          <li
                            key={v.id}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{v.licensePlate}</div>
                            <div className="admin-table-sub">
                              {v.vehicleType}
                              {v.concessionNumber ? ` · Konz. ${v.concessionNumber}` : ""} ·{" "}
                              {REVIEW_DE[v.reviewStatus] || v.reviewStatus}
                              {hasKon && hasFs ? " · Konzession + Fahrzeugschein hochgeladen" : ""}
                            </div>
                            {v.operatorMessage ? (
                              <p style={{ margin: "8px 0", fontSize: 13 }}>Hinweis an Partner: {v.operatorMessage}</p>
                            ) : null}
                            {vDocs.length > 0 ? (
                              <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                                {vDocs.map((d) => (
                                  <li key={d.id} style={{ marginBottom: 4 }}>
                                    <button
                                      type="button"
                                      className="admin-link"
                                      onClick={() => void openDoc(selectedCompanyId, d.id)}
                                    >
                                      {DOC_DE[d.docType] || d.docType}: {d.fileName}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="admin-text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                                Keine fahrzeugbezogenen Dateien — Konzession/Fahrzeugschein ggf. nur auf Mandantenebene.
                              </p>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                className="admin-btn-primary"
                                disabled={!!busy}
                                onClick={() => void setVehicleReview(v.id, "active")}
                              >
                                Aktivieren
                              </button>
                              <button
                                type="button"
                                className="admin-btn-secondary"
                                disabled={!!busy}
                                onClick={() => void setVehicleReview(v.id, "inactive")}
                              >
                                Deaktivieren
                              </button>
                              <button
                                type="button"
                                className="admin-btn-secondary"
                                disabled={!!busy}
                                onClick={() => void setVehicleReview(v.id, "rejected")}
                              >
                                Ablehnen
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {(docsByVehicle.get("_company") ?? []).length > 0 ? (
                  <section>
                    <h3 className="admin-section-block__title">Mandanten-Dokumente</h3>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {(docsByVehicle.get("_company") ?? []).map((d) => (
                        <li key={d.id} style={{ marginBottom: 4 }}>
                          <button
                            type="button"
                            className="admin-link"
                            onClick={() => void openDoc(selectedCompanyId, d.id)}
                          >
                            {DOC_DE[d.docType] || d.docType}: {d.fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <h3 className="admin-section-block__title">Nachrichten an das Unternehmen</h3>
                  <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 10 }}>
                    {detail.messages.length === 0 ? (
                      <p className="admin-text-muted">Noch keine Nachrichten.</p>
                    ) : (
                      detail.messages.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: 8,
                            marginBottom: 8,
                            borderRadius: 6,
                            background: m.senderType === "admin" ? "#ecfeff" : "#f8fafc",
                          }}
                        >
                          <div className="admin-table-sub">
                            {m.senderType === "admin" ? "Plattform" : "Partner"} · {fmt(m.createdAt)}
                            {m.vehicleId ? ` · Fahrzeug ${m.vehicleId.slice(0, 8)}…` : ""}
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <label className="admin-field" style={{ display: "block", marginBottom: 8 }}>
                    <span className="admin-field-label">Bezug Fahrzeug (optional)</span>
                    <select
                      className="admin-input"
                      value={replyVehicleId}
                      onChange={(e) => setReplyVehicleId(e.target.value)}
                    >
                      <option value="">Gesamtes Unternehmen</option>
                      {detail.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.licensePlate}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Antwort an den Mandanten …"
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <button
                    type="button"
                    className="admin-btn-primary"
                    disabled={busy === "msg" || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    {busy === "msg" ? "Senden…" : "Nachricht senden"}
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
