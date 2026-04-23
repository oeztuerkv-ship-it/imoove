import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import { hasPanelModule } from "../../lib/panelNavigation.js";
import { complianceBucketFromCompany, complianceOverviewCopy } from "../../lib/partnerComplianceBucket.js";

function complianceDocItems(company) {
  const docs = company?.complianceDocuments && typeof company.complianceDocuments === "object" ? company.complianceDocuments : {};
  const gewerbe = docs.gewerbe && typeof docs.gewerbe === "object" ? docs.gewerbe : {};
  const insurance = docs.insurance && typeof docs.insurance === "object" ? docs.insurance : {};
  return [
    {
      key: "gewerbe",
      title: "Gewerbenachweis",
      ok: Boolean(company?.hasComplianceGewerbe),
      hintOk: "Nachweis ist hinterlegt.",
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
      uploadedAt: typeof gewerbe.uploadedAt === "string" ? gewerbe.uploadedAt : "",
      reviewStatus: typeof gewerbe.reviewStatus === "string" ? gewerbe.reviewStatus : "",
      reviewNote: typeof gewerbe.reviewNote === "string" ? gewerbe.reviewNote : "",
    },
    {
      key: "insurance",
      title: "Versicherungsnachweis",
      ok: Boolean(company?.hasComplianceInsurance),
      hintOk: "Nachweis ist hinterlegt.",
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
      uploadedAt: typeof insurance.uploadedAt === "string" ? insurance.uploadedAt : "",
      reviewStatus: typeof insurance.reviewStatus === "string" ? insurance.reviewStatus : "",
      reviewNote: typeof insurance.reviewNote === "string" ? insurance.reviewNote : "",
    },
  ];
}

function formatDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE");
}

/** Einzelnachweis: klar getrennt von „Datei liegt vor“ vs. „gültig / freigegeben“. */
function docUiState(item) {
  const st = String(item?.reviewStatus ?? "").trim().toLowerCase();
  const uploadedAt = String(item?.uploadedAt ?? "").trim();
  if (!item?.ok) {
    return {
      key: "missing",
      label: "fehlt",
      tone: "missing",
      text: item?.hintMissing || "Noch kein Nachweis im System.",
      validity: "—",
    };
  }
  if (st === "approved" || st === "freigegeben") {
    return {
      key: "approved",
      label: "freigegeben",
      tone: "neutral",
      text: "Von Onroda geprüft und akzeptiert.",
      validity: "gültig",
    };
  }
  if (st === "rejected" || st === "abgelehnt") {
    return {
      key: "rejected",
      label: "abgelehnt",
      tone: "missing",
      text: item?.reviewNote || "Nicht akzeptiert — bitte korrigieren und erneut als PDF hochladen.",
      validity: "ungültig",
    };
  }
  if (!uploadedAt) {
    return {
      key: "uploaded",
      label: "hochgeladen",
      tone: "review",
      text: "Datei ist im System gespeichert; die fachliche Prüfung steht noch aus.",
      validity: "noch nicht gültig",
    };
  }
  return {
    key: "in_review",
    label: "in Prüfung",
    tone: "review",
    text: "Datei liegt vor und wird durch Onroda geprüft.",
    validity: "noch nicht gültig",
  };
}

function statusPillClass(tone) {
  if (tone === "missing") return "partner-pill partner-pill--missing";
  if (tone === "review") return "partner-pill partner-pill--review";
  return "partner-pill partner-pill--neutral";
}

export default function TaxiDocumentsPage() {
  const { token, user } = usePanelAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadingKind, setUploadingKind] = useState("");
  const [company, setCompany] = useState(null);
  const canUploadDocs = Array.isArray(user?.permissions) && user.permissions.includes("fleet.manage") && hasPanelModule(user?.panelModules, "taxi_fleet");

  const loadCompany = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Nicht angemeldet.");
      return;
    }
    setLoading(true);
    setError("");
    setUploadMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.company) {
        setCompany(null);
        setError(data?.error ? `Dokumente konnten nicht geladen werden: ${String(data.error)}` : "Dokumente konnten nicht geladen werden.");
        return;
      }
      setCompany(data.company);
    } catch {
      setCompany(null);
      setError("Dokumente konnten nicht geladen werden (Netzwerkfehler).");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  const overview = useMemo(() => complianceOverviewCopy(company), [company]);
  const globalBucket = useMemo(() => complianceBucketFromCompany(company), [company]);
  const docItems = useMemo(() => complianceDocItems(company), [company]);
  const missingDocs = docItems.filter((item) => !item.ok);

  function complianceHeaderPill() {
    if (globalBucket === "compliant") return <span className="partner-pill partner-pill--neutral">{overview.label}</span>;
    if (globalBucket === "rejected") return <span className="partner-pill partner-pill--missing">{overview.label}</span>;
    if (globalBucket === "in_review") return <span className="partner-pill partner-pill--review">{overview.label}</span>;
    return <span className="partner-pill partner-pill--missing">{overview.label}</span>;
  }

  async function uploadDocument(kind, ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !token || !canUploadDocs) return;
    if (file.type !== "application/pdf") {
      setUploadMsg("Bitte eine PDF-Datei hochladen.");
      return;
    }
    setUploadMsg("");
    setError("");
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
        if (code === "pdf_body_required") {
          setUploadMsg("Upload fehlgeschlagen: PDF-Datei ist leer oder ungültig.");
        } else if (code === "forbidden") {
          setUploadMsg("Upload nicht erlaubt: fehlende Berechtigung.");
        } else if (code === "module_not_enabled") {
          setUploadMsg("Upload nicht möglich: Modul Flotte ist für Ihr Konto nicht aktiv.");
        } else if (code === "fleet_only_taxi_company") {
          setUploadMsg("Upload nur für Taxi-Unternehmen möglich.");
        } else {
          setUploadMsg("Upload fehlgeschlagen.");
        }
        return;
      }
      setUploadMsg(kind === "gewerbe" ? "Gewerbenachweis hochgeladen." : "Versicherungsnachweis hochgeladen.");
      await loadCompany();
    } catch {
      setUploadMsg("Upload fehlgeschlagen (Netzwerkfehler).");
    } finally {
      setUploadingKind("");
    }
  }

  return (
    <div className="partner-stack partner-stack--tight">
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Nachweise</p>
        <h1 className="partner-page-title">Dokumente &amp; Compliance</h1>
        <p className="partner-page-lead">
          Übersicht der für Ihr Unternehmen hinterlegten Nachweise. Fehlende Unterlagen können Sie hier als{" "}
          <strong>PDF</strong> nachreichen, sofern Ihr Konto die Freigabe dafür hat.
        </p>
      </div>

      {loading ? <p className="partner-state-loading">Dokumente werden geladen …</p> : null}
      {error ? <p className="partner-state-error">{error}</p> : null}
      {uploadMsg ? <p className="partner-state-ok">{uploadMsg}</p> : null}

      {!loading && !error && company ? (
        <>
          <div className="partner-card partner-card--section">
            <h2 className="partner-card__title">Compliance-Gesamtstatus</h2>
            <div className="partner-kv-row" style={{ border: "none", paddingTop: 0 }}>
              <div className="partner-kv-k" style={{ maxWidth: "40%" }}>
                Status
              </div>
              <div className="partner-kv-v" style={{ textAlign: "right" }}>
                {complianceHeaderPill()}
              </div>
            </div>
            <p className="partner-muted" style={{ margin: "8px 0 0" }}>
              {overview.text}
            </p>
          </div>

          <div className="partner-card partner-card--section">
            <span className="partner-section-eyebrow">Pflichtnachweise</span>
            <h2 className="partner-section-h" style={{ margin: "0 0 16px" }}>
              Erforderliche Nachweise
            </h2>
            <div className="partner-stack partner-stack--tight">
              {docItems.map((item) => {
                const ds = docUiState(item);
                return (
                  <div key={item.key} className="partner-nested-panel">
                    <div className="partner-kv-row" style={{ border: "none", paddingTop: 0 }}>
                      <h3 className="partner-kvlist-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                        {item.title}
                      </h3>
                      <span className={statusPillClass(ds.tone)}>{ds.label}</span>
                    </div>
                    <div className="partner-kvlist" style={{ marginTop: 12 }}>
                      <div className="partner-kvlist__row">
                        <span className="partner-kvlist__k">Datei im System</span>
                        <span className="partner-kvlist__v">{item.ok ? "ja (PDF liegt vor)" : "nein"}</span>
                      </div>
                      <div className="partner-kvlist__row">
                        <span className="partner-kvlist__k">Gültigkeit / Freigabe</span>
                        <span className="partner-kvlist__v">{ds.validity}</span>
                      </div>
                      <div className="partner-kvlist__row">
                        <span className="partner-kvlist__k">Hochgeladen am</span>
                        <span className="partner-kvlist__v">{formatDateTime(item.uploadedAt)}</span>
                      </div>
                      <div className="partner-kvlist__row">
                        <span className="partner-kvlist__k">Hinweis</span>
                        <span className="partner-kvlist__v" style={{ textAlign: "right", maxWidth: "100%" }}>
                          {ds.text}
                        </span>
                      </div>
                      {item.reviewNote ? (
                        <div className="partner-kvlist__row">
                          <span className="partner-kvlist__k">Bemerkung</span>
                          <span className="partner-kvlist__v" style={{ textAlign: "right", maxWidth: "100%" }}>
                            {item.reviewNote}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      {canUploadDocs ? (
                        <label
                          className="partner-btn-primary partner-btn-primary--block"
                          role="button"
                          tabIndex={0}
                          style={{
                            cursor: uploadingKind ? "wait" : "pointer",
                            opacity: uploadingKind ? 0.55 : 1,
                            pointerEvents: uploadingKind ? "none" : "auto",
                          }}
                        >
                          {item.ok ? "Erneut hochladen (PDF)" : "Dokument hochladen (PDF)"}
                          <input
                            type="file"
                            accept="application/pdf"
                            style={{ display: "none" }}
                            disabled={Boolean(uploadingKind)}
                            onChange={(ev) => void uploadDocument(item.key, ev)}
                          />
                        </label>
                      ) : (
                        <p className="partner-muted" style={{ margin: 0 }}>
                          Upload aktuell nicht verfügbar. Bitte Benutzerrechte und Module prüfen.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {missingDocs.length > 0 ? (
            <div className="partner-card partner-card--section">
              <h2 className="partner-card__title">Hinweis bei fehlenden Dokumenten</h2>
              <p className="partner-muted" style={{ margin: 0 }}>
                Es fehlen {missingDocs.length} Nachweis(e). Für die Nachreichung gilt der vorgesehene Freigabeprozess.
              </p>
            </div>
          ) : (
            <div className="partner-card partner-card--section">
              <h2 className="partner-card__title">Stand</h2>
              <p className="partner-muted" style={{ margin: 0 }}>
                Alle aktuell erwarteten Nachweise sind hinterlegt.
              </p>
            </div>
          )}

          <p className="partner-muted" style={{ margin: "8px 0 0" }}>
            Erneuter Upload ersetzt den bisherigen Stand und startet die Prüfung neu.
          </p>
        </>
      ) : null}
    </div>
  );
}
