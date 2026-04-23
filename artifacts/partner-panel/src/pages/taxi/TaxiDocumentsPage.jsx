import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import { hasPanelModule } from "../../lib/panelNavigation.js";

function normalizeComplianceStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return { label: "Unbekannt", tone: "warn", text: "Der Compliance-Status ist aktuell nicht gesetzt." };
  if (value === "approved") {
    return { label: "Freigegeben", tone: "ok", text: "Ihr Unternehmen ist aktuell aus Compliance-Sicht freigegeben." };
  }
  if (value === "rejected") {
    return {
      label: "Abgelehnt",
      tone: "warn",
      text: "Mindestens ein Nachweis wurde nicht akzeptiert. Bitte den Änderungs-/Freigabeprozess nutzen.",
    };
  }
  if (value === "pending") {
    return {
      label: "In Prüfung",
      tone: "pending",
      text: "Es liegen noch offene Prüfungen vor. Fehlende Nachweise können den Status beeinflussen.",
    };
  }
  return { label: value, tone: "pending", text: "Der Status wird aus dem Backend übernommen." };
}

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

function docState(item) {
  const st = String(item?.reviewStatus ?? "").trim().toLowerCase();
  if (!item?.ok) {
    return {
      key: "missing",
      label: "fehlt",
      tone: "warn",
      text: item?.hintMissing || "Dokument fehlt.",
    };
  }
  if (st === "approved" || st === "freigegeben") {
    return {
      key: "approved",
      label: "freigegeben",
      tone: "ok",
      text: "Dokument wurde freigegeben.",
    };
  }
  if (st === "rejected" || st === "abgelehnt") {
    return {
      key: "rejected",
      label: "abgelehnt",
      tone: "warn",
      text: item?.reviewNote || "Dokument wurde abgelehnt. Bitte korrigieren und erneut hochladen.",
    };
  }
  return {
    key: "pending",
    label: "hochgeladen / in Prüfung",
    tone: "pending",
    text: item?.hintOk || "Dokument ist hinterlegt und wird geprüft.",
  };
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

  const status = useMemo(() => normalizeComplianceStatus(company?.complianceStatus), [company?.complianceStatus]);
  const docItems = useMemo(() => complianceDocItems(company), [company]);
  const missingDocs = docItems.filter((item) => !item.ok);

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
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Dokumente &amp; Compliance</h2>
      <p className="panel-page__lead">
        Grundlage: <code className="panel-card__muted">GET /panel/v1/company</code> plus Upload je Dokument als PDF.
      </p>

      {loading ? <p className="panel-page__lead">Dokumente werden geladen …</p> : null}
      {error ? <p className="panel-page__warn">{error}</p> : null}
      {uploadMsg ? <p className="panel-page__ok">{uploadMsg}</p> : null}

      {!loading && !error && company ? (
        <>
          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">Compliance-Gesamtstatus</h3>
            <p className="panel-card__row" style={{ alignItems: "center" }}>
              <span className="panel-card__k">Status</span>
              <span style={{ fontWeight: 700 }}>
                {status.tone === "ok" ? (
                  <span className="panel-pill panel-pill--ok">{status.label}</span>
                ) : status.tone === "warn" ? (
                  <span className="panel-pill panel-pill--warn">{status.label}</span>
                ) : (
                  <span className="panel-pill">{status.label}</span>
                )}
              </span>
            </p>
            <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 8 }}>
              {status.text}
            </p>
          </div>

          <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
            <h3 className="panel-card__title">Erforderliche Nachweise</h3>
            {docItems.map((item) => (
              <div key={item.key} className="panel-card" style={{ marginBottom: 10 }}>
                <div className="panel-card__row" style={{ alignItems: "flex-start" }}>
                  <span className="panel-card__k">{item.title}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>
                    {docState(item).tone === "ok" ? (
                      <span className="panel-pill panel-pill--ok">{docState(item).label}</span>
                    ) : docState(item).tone === "warn" ? (
                      <span className="panel-pill panel-pill--warn">{docState(item).label}</span>
                    ) : (
                      <span className="panel-pill">{docState(item).label}</span>
                    )}
                  </span>
                </div>
                <div className="panel-card__row" style={{ alignItems: "flex-start" }}>
                  <span className="panel-card__k">Vorhanden</span>
                  <span style={{ fontWeight: 600 }}>{item.ok ? "ja" : "nein"}</span>
                </div>
                <div className="panel-card__row" style={{ alignItems: "flex-start" }}>
                  <span className="panel-card__k">Hochgeladen am</span>
                  <span style={{ fontWeight: 600 }}>{formatDateTime(item.uploadedAt)}</span>
                </div>
                <div className="panel-card__row" style={{ alignItems: "flex-start" }}>
                  <span className="panel-card__k">Prüfhinweis</span>
                  <span style={{ fontWeight: 500, maxWidth: 560, textAlign: "right" }}>{docState(item).text}</span>
                </div>
                {item.reviewNote ? (
                  <div className="panel-card__row" style={{ alignItems: "flex-start" }}>
                    <span className="panel-card__k">Ablehnungsgrund / Bemerkung</span>
                    <span style={{ fontWeight: 500, maxWidth: 560, textAlign: "right" }}>{item.reviewNote}</span>
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  {canUploadDocs ? (
                    <label className="panel-btn" style={{ cursor: uploadingKind ? "wait" : "pointer" }}>
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
                    <p className="panel-page__muted" style={{ margin: 0 }}>
                      Upload aktuell nicht verfügbar. Bitte Benutzerrechte/Module prüfen.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {missingDocs.length > 0 ? (
            <div className="panel-card panel-card--wide panel-card--hint">
              <h3 className="panel-card__title">Hinweis bei fehlenden Dokumenten</h3>
              <p className="panel-page__muted panel-page__muted--tight">
                Es fehlen {missingDocs.length} Nachweis(e). Für die Nachreichung gilt der vorgesehene
                Änderungs-/Freigabeprozess.
              </p>
            </div>
          ) : (
            <div className="panel-card panel-card--wide panel-card--hint">
              <h3 className="panel-card__title">Status</h3>
              <p className="panel-page__muted panel-page__muted--tight">Alle aktuell erwarteten Nachweise sind hinterlegt.</p>
            </div>
          )}

          <p className="panel-page__muted" style={{ marginTop: 12 }}>
            Erneuter Upload ersetzt den bisherigen Stand und startet die Prüfung neu.
          </p>
        </>
      ) : null}
    </div>
  );
}
