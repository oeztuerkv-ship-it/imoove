import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";

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
  return [
    {
      key: "gewerbe",
      title: "Gewerbenachweis",
      ok: Boolean(company?.hasComplianceGewerbe),
      hintOk: "Nachweis ist hinterlegt.",
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
    },
    {
      key: "insurance",
      title: "Versicherungsnachweis",
      ok: Boolean(company?.hasComplianceInsurance),
      hintOk: "Nachweis ist hinterlegt.",
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
    },
  ];
}

export default function TaxiDocumentsPage() {
  const { token } = usePanelAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [company, setCompany] = useState(null);

  const loadCompany = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Nicht angemeldet.");
      return;
    }
    setLoading(true);
    setError("");
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

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Dokumente &amp; Compliance</h2>
      <p className="panel-page__lead">
        Grundlage: <code className="panel-card__muted">GET /panel/v1/company</code>. Dieser Schritt ist reine Anzeige
        von Nachweis- und Compliance-Status.
      </p>

      {loading ? <p className="panel-page__lead">Dokumente werden geladen …</p> : null}
      {error ? <p className="panel-page__warn">{error}</p> : null}

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
              <div key={item.key} className="panel-card__row" style={{ alignItems: "flex-start" }}>
                <span className="panel-card__k">{item.title}</span>
                <span style={{ fontWeight: 600 }}>
                  {item.ok ? (
                    <span className="panel-pill panel-pill--ok">vorhanden</span>
                  ) : (
                    <span className="panel-pill panel-pill--warn">fehlt</span>
                  )}
                  <span className="panel-card__muted" style={{ display: "block", marginTop: 6, fontWeight: 400 }}>
                    {item.ok ? item.hintOk : item.hintMissing}
                  </span>
                </span>
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
            Dokumente können hier später hochgeladen werden.
          </p>
        </>
      ) : null}
    </div>
  );
}
