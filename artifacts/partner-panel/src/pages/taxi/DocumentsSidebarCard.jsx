import { useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import {
  complianceDocItems,
  docUiState,
  formatDateTime,
  statusPillClass,
} from "../../lib/taxiComplianceDocumentsUi.js";

function displayLine(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "" ? "" : s;
}

function missingLabel() {
  return <span className="partner-settings-sidebar__missing">Nicht hinterlegt</span>;
}

/**
 * Rechte Spalte: Dokumentübersicht (Bolt-ähnlich). Upload nur für API‑unterstützte Typen (Gewerbe/Versicherung).
 */
export default function DocumentsSidebarCard({
  company,
  canUploadDocs,
  onAfterUpload,
  onOpenDocumentSupportRequest,
  onNavigateFullDocuments,
}) {
  const { token } = usePanelAuth();
  const [uploadingKind, setUploadingKind] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");

  const docItems = complianceDocItems(company);

  async function uploadDocument(kind, ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !token || !canUploadDocs) return;
    if (file.type !== "application/pdf") {
      setUploadMsg("Bitte eine PDF-Datei hochladen.");
      return;
    }
    setUploadMsg("");
    setUploadingKind(kind);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API_BASE}/panel/v1/fleet/compliance/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
        },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        if (code === "forbidden") setUploadMsg("Upload nicht erlaubt.");
        else if (code === "module_not_enabled") setUploadMsg("Modul Flotte nicht aktiv.");
        else setUploadMsg("Upload fehlgeschlagen.");
        return;
      }
      setUploadMsg(kind === "gewerbe" ? "Gewerbenachweis hochgeladen." : "Versicherungsnachweis hochgeladen.");
      if (typeof onAfterUpload === "function") onAfterUpload();
    } catch {
      setUploadMsg("Netzwerkfehler beim Upload.");
    } finally {
      setUploadingKind("");
    }
  }

  function openDocSupport(item, ds) {
    if (typeof onOpenDocumentSupportRequest !== "function") return;
    onOpenDocumentSupportRequest({
      category: "documents",
      title: `Rückfrage: ${item.title}`,
      body: `Guten Tag,\n\nRückfrage zu unserem Nachweis „${item.title}“ (aktueller Stand: ${ds.label}).\n\n`,
    });
  }

  const concessionOk = Boolean(displayLine(company?.concessionNumber));

  return (
    <aside className="partner-settings-sidebar" aria-label="Dokumente">
      <div className="partner-settings-sidebar__card">
        <h2 className="partner-settings-sidebar__title">Dokumente</h2>
        {uploadMsg ? <p className="partner-state-ok partner-settings-sidebar__flash">{uploadMsg}</p> : null}

        <ul className="partner-settings-sidebar__list">
          {/* Konzession — nur Stammdaten-Feld, kein separates Dokumenten‑Datum in API */}
          <li className="partner-settings-sidebar__item">
            <div className="partner-settings-sidebar__rowhead">
              <span className="partner-settings-sidebar__doctitle">Konzession</span>
              <span className={concessionOk ? "partner-pill partner-pill--neutral" : "partner-pill partner-pill--missing"}>
                {concessionOk ? "Nr. hinterlegt" : "fehlt"}
              </span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Ablauf</span>
              <span>—</span>
            </div>
            <p className="partner-settings-sidebar__hint">Konzessionsnummer wird unter „Steuerinformationen“ geführt.</p>
          </li>

          {docItems.map((item) => {
            const ds = docUiState(item);
            const isGewerbe = item.key === "gewerbe";
            const uploadLabel = isGewerbe ? "Gewerbeanmeldung" : "Versicherung";
            return (
              <li key={item.key} className="partner-settings-sidebar__item">
                <div className="partner-settings-sidebar__rowhead">
                  <span className="partner-settings-sidebar__doctitle">{uploadLabel}</span>
                  <span className={statusPillClass(ds.tone)}>{ds.label}</span>
                </div>
                <div className="partner-settings-sidebar__meta">
                  <span>Prüfstatus</span>
                  <span>{ds.validity}</span>
                </div>
                <div className="partner-settings-sidebar__meta">
                  <span>Hochgeladen</span>
                  <span>{formatDateTime(item.uploadedAt)}</span>
                </div>
                <div className="partner-settings-sidebar__actions">
                  {canUploadDocs ? (
                    <label
                      className="partner-settings-sidebar__upload"
                      style={{
                        opacity: uploadingKind ? 0.6 : 1,
                        pointerEvents: uploadingKind ? "none" : "auto",
                      }}
                    >
                      {item.ok ? "Aktualisieren (PDF)" : "Hochladen (PDF)"}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="partner-settings-sidebar__file"
                        disabled={Boolean(uploadingKind)}
                        onChange={(ev) => void uploadDocument(item.key, ev)}
                      />
                    </label>
                  ) : (
                    <span className="partner-settings-sidebar__muted">Upload nicht freigeschaltet</span>
                  )}
                  {typeof onOpenDocumentSupportRequest === "function" && (ds.key === "rejected" || ds.key === "in_review") ? (
                    <button type="button" className="partner-settings-sidebar__linkish" onClick={() => openDocSupport(item, ds)}>
                      Rückfrage
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}

          <li className="partner-settings-sidebar__item">
            <div className="partner-settings-sidebar__rowhead">
              <span className="partner-settings-sidebar__doctitle">Führerschein</span>
              <span className="partner-pill partner-pill--soft">Flotte</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Status</span>
              <span>{missingLabel()}</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Ablauf</span>
              <span>—</span>
            </div>
            <p className="partner-settings-sidebar__hint">Pro Fahrer in „Flotte“ – hier keine Mandanten-Stammdaten.</p>
          </li>

          <li className="partner-settings-sidebar__item">
            <div className="partner-settings-sidebar__rowhead">
              <span className="partner-settings-sidebar__doctitle">P-Schein</span>
              <span className="partner-pill partner-pill--soft">Flotte</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Status</span>
              <span>{missingLabel()}</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Ablauf</span>
              <span>—</span>
            </div>
            <p className="partner-settings-sidebar__hint">Pro Fahrer in „Flotte“.</p>
          </li>

          <li className="partner-settings-sidebar__item">
            <div className="partner-settings-sidebar__rowhead">
              <span className="partner-settings-sidebar__doctitle">Krankenkassenvertrag</span>
              <span className="partner-pill partner-pill--missing">fehlt</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Ablauf</span>
              <span>—</span>
            </div>
            <p className="partner-settings-sidebar__hint">Im Panel derzeit kein eigener Nachweis-Typ.</p>
          </li>

          <li className="partner-settings-sidebar__item">
            <div className="partner-settings-sidebar__rowhead">
              <span className="partner-settings-sidebar__doctitle">Rechnungsnachweis</span>
              <span className="partner-pill partner-pill--missing">fehlt</span>
            </div>
            <div className="partner-settings-sidebar__meta">
              <span>Ablauf</span>
              <span>—</span>
            </div>
            <p className="partner-settings-sidebar__hint">Separater Dokumenten-Upload in der API nicht vorgesehen.</p>
          </li>
        </ul>

        {typeof onNavigateFullDocuments === "function" ? (
          <button type="button" className="partner-settings-sidebar__footer-link" onClick={onNavigateFullDocuments}>
            Zu Flotte · Dokumentstatus
          </button>
        ) : null}
      </div>
    </aside>
  );
}
