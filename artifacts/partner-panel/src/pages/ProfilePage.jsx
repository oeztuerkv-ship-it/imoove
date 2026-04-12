import { useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

/** Schritt 3: Profil / Firma / Anschrift — hier nur lesende API-Anbindung wie Übersicht. */
export default function ProfilePage() {
  const { token, user } = usePanelAuth();
  const [company, setCompany] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/company`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setErr("Firmendaten konnten nicht geladen werden.");
          setCompany(null);
          return;
        }
        setCompany(data.company ?? null);
      } catch {
        if (!cancelled) setErr("Firmendaten konnten nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Profil und Firma</h2>
      <p className="panel-page__lead">
        Kontext aus der API (live). Bearbeitung von Anschrift und Rechnungsdaten folgt im nächsten Ausbau — dann mit
        gesicherten Endpunkten nur für berechtigte Rollen.
      </p>

      <div className="panel-card panel-card--wide">
        <h3 className="panel-card__title">Dein Zugang</h3>
        <p className="panel-card__row">
          <span className="panel-card__k">Benutzer</span> {user?.username ?? "—"}
        </p>
        <p className="panel-card__row">
          <span className="panel-card__k">Rolle</span> {user?.role ?? "—"}
        </p>
        <p className="panel-card__row">
          <span className="panel-card__k">E-Mail</span> {user?.email || "—"}
        </p>
        <p className="panel-card__row">
          <span className="panel-card__k">Firma</span> {user?.companyName ?? "—"}
        </p>
      </div>

      {err ? <p className="panel-page__warn">{err}</p> : null}

      {company ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Firma (API)</h3>
          <p className="panel-card__row">
            <span className="panel-card__k">Name</span> {company.name}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">E-Mail</span> {company.email || "—"}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Telefon</span> {company.phone || "—"}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Aktiv</span> {company.isActive ? "ja" : "nein"}
          </p>
        </div>
      ) : null}

      <p className="panel-page__lead panel-page__lead--footnote">
        Anschrift, IBAN und erweiterte Stammdaten: nach Freigabe der Schreib-API hier integrieren.
      </p>
    </div>
  );
}
