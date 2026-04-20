import { useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { canAccessPartnerCompanyPage, hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function formatEur(n) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function OverviewPage() {
  const { user, token } = usePanelAuth();
  const [company, setCompany] = useState(null);
  const [companyErr, setCompanyErr] = useState("");
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [fleetDash, setFleetDash] = useState(null);
  const [rideMetrics, setRideMetrics] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setCompanyErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/company`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setCompanyErr("Firmendaten konnten nicht geladen werden.");
          setCompany(null);
          return;
        }
        setCompany(data.company ?? null);
      } catch {
        if (!cancelled) setCompanyErr("Firmendaten konnten nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !hasPanelModule(user?.panelModules, "taxi_fleet")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/panel/v1/fleet/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setFleetDash(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.panelModules]);

  useEffect(() => {
    if (!token || !hasPerm(user?.permissions, "rides.read")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/panel/v1/overview/metrics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setRideMetrics(data.metrics ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.permissions]);

  async function onChangePassword(e) {
    e.preventDefault();
    if (!token || !hasPerm(user?.permissions, "self.change_password")) return;
    setPwMsg("");
    setPwBusy(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/me/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword: pwCur, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "invalid_current_password") setPwMsg("Aktuelles Passwort ist falsch.");
        else setPwMsg("Passwort konnte nicht geändert werden.");
        return;
      }
      setPwMsg("Passwort wurde geändert.");
      setPwCur("");
      setPwNew("");
    } catch {
      setPwMsg("Passwort konnte nicht geändert werden.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="panel-page panel-page--overview">
      <div className="panel-overview-hero">
        <p className="panel-overview-hero__eyebrow">Ihr Unternehmensbereich</p>
        <h2 className="panel-overview-hero__title">
          Guten Tag{user?.username ? `, ${user.username}` : ""}
          {user?.companyName ? (
            <>
              <span className="panel-overview-hero__break" />
              <span className="panel-overview-hero__company">{user.companyName}</span>
            </>
          ) : null}
        </h2>
        <p className="panel-overview-hero__lead">
          Fahrten, Codes und Stammdaten für {user?.companyName ? "Ihr Unternehmen" : "Ihr Team"}.
        </p>
      </div>
      {companyErr ? <p className="panel-page__warn">{companyErr}</p> : null}
      {rideMetrics ? (
        <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
          <h3 className="panel-card__title">Kennzahlen Fahrten</h3>
          <p className="panel-page__muted panel-page__muted--tight">
            Umsatz nur aus <strong>abgeschlossenen</strong> Fahrten (Endpreis oder Schätzpreis). Kalendertag und Monat
            nach Ortszeit {rideMetrics.zone}. Woche: <strong>letzte 7 Tage</strong> (rollierend).
          </p>
          <div className="panel-fleet-dash" style={{ flexWrap: "wrap" }}>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{formatEur(rideMetrics.today.revenue)}</span>
              <span className="panel-fleet-dash__lbl">Umsatz heute</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{rideMetrics.today.completedRides}</span>
              <span className="panel-fleet-dash__lbl">Abgeschlossen heute</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{formatEur(rideMetrics.week.revenue)}</span>
              <span className="panel-fleet-dash__lbl">Umsatz 7 Tage</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{rideMetrics.week.completedRides}</span>
              <span className="panel-fleet-dash__lbl">Abgeschlossen 7 Tage</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{formatEur(rideMetrics.month.revenue)}</span>
              <span className="panel-fleet-dash__lbl">Umsatz Monat</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{rideMetrics.month.completedRides}</span>
              <span className="panel-fleet-dash__lbl">Abgeschlossen Monat</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{rideMetrics.openRides}</span>
              <span className="panel-fleet-dash__lbl">Nicht abgeschlossen</span>
            </div>
          </div>
          <p className="panel-page__muted panel-page__muted--tight" style={{ marginTop: 10 }}>
            <strong>Ausgaben / Kosten</strong> werden im Partner-Panel noch nicht gegen Fahrten verbucht — dafür nutzen
            Sie Ihre Buchhaltung oder spätere Erweiterungen.
          </p>
          {hasPanelModule(user?.panelModules, "billing") ? (
            <p className="panel-page__lead" style={{ marginTop: 8 }}>
              Details und Export: <strong>Abrechnung</strong> in der Seitenleiste.
            </p>
          ) : null}
        </div>
      ) : null}
      {fleetDash ? (
        <div className="panel-card panel-card--wide" style={{ marginBottom: 16 }}>
          <h3 className="panel-card__title">Flotte — Kurzüberblick</h3>
          <div className="panel-fleet-dash">
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{fleetDash.driversOnline ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Fahrer online</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{fleetDash.driversTotal ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Fahrer gesamt</span>
            </div>
            <div className="panel-fleet-dash__kpi">
              <span className="panel-fleet-dash__num">{fleetDash.vehiclesActive ?? 0}</span>
              <span className="panel-fleet-dash__lbl">Aktive Fahrzeuge</span>
            </div>
          </div>
          <p className="panel-page__lead" style={{ marginTop: 10 }}>
            Details finden Sie unter <strong>Flotte &amp; Fahrer</strong> in der Seitenleiste.
          </p>
        </div>
      ) : null}
      <div className="panel-card panel-card--hint panel-card--wide">
        <h3 className="panel-card__title">Was Sie hier tun können</h3>
        <ul className="panel-hint-list">
          {hasPanelModule(user?.panelModules, "rides_list") ? (
            <li>
              <strong>Meine Fahrten</strong> und <strong>Mein Verlauf</strong> — aktuelle und abgeschlossene Aufträge
              Ihres Unternehmens, inklusive Export.
            </li>
          ) : null}
          {hasPanelModule(user?.panelModules, "rides_create") ? (
            <li>
              <strong>Neue Fahrt anlegen</strong> — Aufträge für Ihr Unternehmen erfassen (sofern Ihre Rolle das
              erlaubt).
            </li>
          ) : null}
          {canAccessPartnerCompanyPage(user?.panelModules) ? (
            <li>
              <strong>Meine Firma</strong> — Stammdaten und Kontakt.
            </li>
          ) : null}
          {hasPanelModule(user?.panelModules, "team") ? (
            <li>
              <strong>Mitarbeiter</strong> — Zugänge für Ihr Team verwalten (Rollen, Passwörter, Aktivierung).
            </li>
          ) : null}
          {hasPanelModule(user?.panelModules, "access_codes") ? (
            <li>
              <strong>Freigabe-Codes</strong> — digitale Kostenübernahme für Gäste und Kunden, wenn für Sie
              freigeschaltet.
            </li>
          ) : null}
        </ul>
      </div>

      {hasPerm(user?.permissions, "self.change_password") ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Mein Passwort ändern</h3>
          <form className="panel-rides-form" onSubmit={onChangePassword}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Aktuelles Passwort</span>
                <input
                  type="password"
                  value={pwCur}
                  onChange={(ev) => setPwCur(ev.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Neues Passwort (min. 10 Zeichen)</span>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(ev) => setPwNew(ev.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={10}
                />
              </label>
            </div>
            {pwMsg ? (
              <p className={pwMsg.includes("geändert") ? "panel-page__ok" : "panel-page__warn"}>{pwMsg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary" disabled={pwBusy}>
              {pwBusy ? "Speichern …" : "Passwort speichern"}
            </button>
          </form>
        </div>
      ) : null}

      {company ? (
        <div className="panel-card">
          <h3 className="panel-card__title">Meine Firmendaten</h3>
          <p className="panel-card__row">
            <span className="panel-card__k">Name</span> {company.name}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">E-Mail</span> {company.email || "—"}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Telefon</span> {company.phone || "—"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
